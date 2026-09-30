import type { RecognizeResponse, SongResult } from "@/lib/types";
import { toNamedAudioFile } from "@/lib/audioFile";

export type { SongResult };

export type AnalyzeAudioResult =
  | {
      ok: true;
      success: true;
      songs: SongResult[];
      source: "shazam" | "audd" | "acrcloud" | "itunes";
      confidence?: number;
      status?: "EXACT_MATCH" | "CANDIDATES";
      searchMode?: "quick" | "power";
    }
  | {
      ok: false;
      success: false;
      error?: string;
      reason: string;
      status?: "NO_MATCH";
      triggerPowerSearch?: boolean;
    };

type RecognizeFilters = {
  lyrics?: string;
  genre?: string;
  era?: string;
  songSection?: string;
};

type AnalyzeOptions = RecognizeFilters & {
  searchMode?: "quick" | "power";
};

/**
 * Build multipart FormData for /api/recognize.
 * Always sends a named file (recording.webm) so backends don't discard the blob.
 * Do not set Content-Type manually — the browser adds the multipart boundary.
 */
export function buildRecognizeFormData(
  blob: Blob | null,
  filters: RecognizeFilters = {},
): FormData {
  const formData = new FormData();

  if (blob && blob.size > 0) {
    const file = toNamedAudioFile(blob, "recording.webm");
    // Primary field our route reads
    formData.append("audio", file, file.name);
    // Also attach common upstream field names for any proxy/debug tooling
    formData.append("file", file, file.name);
    formData.append("upload_file", file, file.name);
  }

  formData.append("lyrics", filters.lyrics ?? "");
  formData.append("genre", filters.genre ?? "any");
  formData.append("era", filters.era ?? "any");
  formData.append("songSection", filters.songSection ?? "any");

  return formData;
}

function isRealSuccess(
  data: RecognizeResponse,
): data is Extract<RecognizeResponse, { success: true }> {
  return Boolean(
    data.success &&
      data.ok &&
      Array.isArray(data.songs) &&
      data.songs.length > 0 &&
      data.songs.every(
        (song) =>
          typeof song.title === "string" &&
          song.title.trim().length > 0 &&
          typeof song.artist === "string" &&
          song.artist.trim().length > 0,
      ),
  );
}

/**
 * Client-side helper: posts audio + filters to /api/recognize.
 * Never invents songs — failures always return success: false.
 */
export async function analyzeAudio(
  blob: Blob | null,
  options: AnalyzeOptions = {},
): Promise<AnalyzeAudioResult> {
  const { searchMode = "quick", ...filters } = options;
  const formData = buildRecognizeFormData(blob, filters);

  try {
    const response = await fetch("/api/recognize", {
      method: "POST",
      body: formData,
    });

    let data: RecognizeResponse & {
      song?: SongResult;
      message?: string;
      triggerPowerSearch?: boolean;
    };

    try {
      data = (await response.json()) as typeof data;
    } catch {
      console.log("[analyzeAudio] Non-JSON response", {
        status: response.status,
        searchMode,
      });
      return {
        ok: false,
        success: false,
        status: "NO_MATCH",
        triggerPowerSearch: true,
        error: "NO_MATCH",
        reason: "Audio could not be identified. Switching to Power Search.",
      };
    }

    // Browser console: inspect exact backend payload
    console.log("[analyzeAudio] Backend JSON response", data);

    // Prefer explicit song on EXACT_MATCH
    if (
      (data.status === "EXACT_MATCH" || data.success) &&
      data.song &&
      data.song.title?.trim() &&
      data.song.artist?.trim()
    ) {
      return {
        ok: true,
        success: true,
        songs: [data.song],
        source: data.success ? data.source : "audd",
        confidence: data.success ? data.confidence : undefined,
        status: "EXACT_MATCH",
        searchMode: data.success ? data.searchMode : searchMode,
      };
    }

    if (isRealSuccess(data)) {
      return {
        ok: true,
        success: true,
        songs: data.songs,
        source: data.source,
        confidence: data.confidence,
        status: data.status,
        searchMode: data.searchMode ?? searchMode,
      };
    }

    console.log("[analyzeAudio] Treating response as failure (no real songs)", {
      success: data.success,
      status: "status" in data ? data.status : undefined,
      songCount:
        "songs" in data && Array.isArray(data.songs) ? data.songs.length : 0,
    });

    return {
      ok: false,
      success: false,
      status: "NO_MATCH",
      triggerPowerSearch: true,
      error: !data.success ? data.error : "NO_MATCH",
      reason:
        (!data.success && (data.message || data.reason)) ||
        "Audio could not be identified. Switching to Power Search.",
    };
  } catch (error) {
    console.log("[analyzeAudio] Fetch failed", error);
    return {
      ok: false,
      success: false,
      error: "SEARCH_FAILED",
      reason: "Recognition request failed. Please try again.",
      status: "NO_MATCH",
      triggerPowerSearch: true,
    };
  }
}
