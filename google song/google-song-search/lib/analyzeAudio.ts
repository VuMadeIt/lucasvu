import type { RecognizeResponse, SongResult } from "@/lib/types";

export type { SongResult };

export type AnalyzeAudioResult =
  | {
      ok: true;
      success: true;
      songs: SongResult[];
      source: "shazam" | "audd" | "acrcloud" | "itunes" | "mock";
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

const POWER_MATCH_PERCENTS = [94, 81, 67, 52, 40] as const;

/**
 * Preserve backend matchPercent when present; otherwise assign ranked defaults.
 */
function withMatchPercents(songs: SongResult[]): SongResult[] {
  return songs.slice(0, 5).map((song, index) => ({
    ...song,
    matchPercent:
      typeof song.matchPercent === "number"
        ? song.matchPercent
        : (POWER_MATCH_PERCENTS[index] ?? Math.max(35, 90 - index * 12)),
  }));
}

/**
 * Build multipart FormData for /api/recognize.
 * Always appends filter fields so the backend can detect Power Search clues.
 * Do not set Content-Type manually — the browser adds the multipart boundary.
 */
export function buildRecognizeFormData(
  blob: Blob | null,
  filters: RecognizeFilters = {},
): FormData {
  const formData = new FormData();

  if (blob && blob.size > 0) {
    const type = blob.type || "audio/webm";
    const extension = type.includes("ogg")
      ? "ogg"
      : type.includes("mp4") || type.includes("m4a")
        ? "m4a"
        : type.includes("mpeg") || type.includes("mp3")
          ? "mp3"
          : type.includes("wav")
            ? "wav"
            : "webm";

    formData.append(
      "audio",
      new File([blob], `recording.${extension}`, { type }),
    );
  }

  formData.append("lyrics", filters.lyrics ?? "");
  formData.append("genre", filters.genre ?? "any");
  formData.append("era", filters.era ?? "any");
  formData.append("songSection", filters.songSection ?? "any");

  return formData;
}

function mapRecognizeSuccess(
  data: Extract<RecognizeResponse, { success: true }>,
): AnalyzeAudioResult {
  return {
    ok: true,
    success: true,
    songs: withMatchPercents(data.songs),
    source: data.source,
    confidence: data.confidence,
    status: data.status,
    searchMode: data.searchMode,
  };
}

/**
 * Client-side helper: posts audio + Power Search filters to /api/recognize.
 * Power mode sends both the recording and filter text fields in one FormData body.
 */
export async function analyzeAudio(
  blob: Blob | null,
  options: AnalyzeOptions = {},
): Promise<AnalyzeAudioResult> {
  const { searchMode = "quick", ...filters } = options;
  const formData = buildRecognizeFormData(blob, filters);

  // Power Search: audio blob + lyrics/genre/era/songSection → backend text ranking
  if (searchMode === "power") {
    try {
      const response = await fetch("/api/recognize", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as RecognizeResponse;

      if (data.success && data.ok && data.songs.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return mapRecognizeSuccess(data);
      }

      return {
        ok: false,
        success: false,
        error: !data.success ? data.error : "NO_MATCH",
        reason:
          (!data.success && (data.message || data.reason)) ||
          "No songs matched those Power Search clues.",
        status: "NO_MATCH",
        triggerPowerSearch: true,
      };
    } catch {
      return {
        ok: false,
        success: false,
        error: "SEARCH_FAILED",
        reason: "Power Search failed. Please try again.",
        status: "NO_MATCH",
        triggerPowerSearch: true,
      };
    }
  }

  const response = await fetch("/api/recognize", {
    method: "POST",
    body: formData,
  });

  let data: RecognizeResponse & {
    status?: string;
    triggerPowerSearch?: boolean;
    song?: SongResult;
    message?: string;
  };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    return {
      ok: false,
      success: false,
      status: "NO_MATCH",
      triggerPowerSearch: true,
      reason: "Audio could not be identified. Switching to Power Search.",
    };
  }

  if (data.status === "EXACT_MATCH") {
    const song =
      ("song" in data && data.song) ||
      (data.success && "songs" in data && data.songs[0]);
    if (song) {
      return {
        ok: true,
        success: true,
        songs: [song],
        source: data.success ? data.source : "shazam",
        confidence: data.success ? data.confidence : undefined,
        status: "EXACT_MATCH",
        searchMode: "quick",
      };
    }
  }

  if (
    data.status === "CANDIDATES" &&
    data.success &&
    "songs" in data &&
    data.songs.length > 0
  ) {
    return {
      ok: true,
      success: true,
      songs: withMatchPercents(data.songs),
      source: data.source,
      status: "CANDIDATES",
      searchMode: data.searchMode ?? "quick",
    };
  }

  if (data.status === "NO_MATCH" || data.triggerPowerSearch) {
    return {
      ok: false,
      success: false,
      status: "NO_MATCH",
      triggerPowerSearch: true,
      error: "NO_MATCH",
      reason:
        data.message ||
        ("reason" in data ? data.reason : undefined) ||
        "Audio could not be identified. Switching to Power Search.",
    };
  }

  if (!data.success || !("songs" in data)) {
    const failure = data as Extract<RecognizeResponse, { success: false }>;
    return {
      ok: false,
      success: false,
      error: failure.error,
      reason:
        failure.message ||
        failure.reason ||
        "Could not confidently identify audio",
      triggerPowerSearch: true,
      status: "NO_MATCH",
    };
  }

  return mapRecognizeSuccess(data);
}
