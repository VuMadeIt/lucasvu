import type { RecognizeResponse, SongResult } from "@/lib/types";

export type { SongResult };

export type AnalyzeAudioResult =
  | {
      ok: true;
      success: true;
      songs: SongResult[];
      source: "shazam" | "itunes";
      confidence?: number;
    }
  | {
      ok: false;
      success: false;
      error?: string;
      reason: string;
    };

type RecognizeFilters = {
  lyrics?: string;
  genre?: string;
  era?: string;
};

/**
 * Build multipart FormData for /api/recognize.
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

  if (filters.lyrics) formData.append("lyrics", filters.lyrics);
  if (filters.genre) formData.append("genre", filters.genre);
  if (filters.era) formData.append("era", filters.era);

  return formData;
}

/**
 * Client-side helper: posts audio + Power Search filters to our secure API route.
 * The RapidAPI key never leaves the server.
 */
export async function analyzeAudio(
  blob: Blob | null,
  filters: RecognizeFilters = {},
): Promise<AnalyzeAudioResult> {
  const formData = buildRecognizeFormData(blob, filters);

  const response = await fetch("/api/recognize", {
    method: "POST",
    // multipart/form-data is set automatically from FormData (with boundary).
    body: formData,
  });

  let data: RecognizeResponse;
  try {
    data = (await response.json()) as RecognizeResponse;
  } catch {
    return {
      ok: false,
      success: false,
      reason: "Couldn't read the recognition response.",
    };
  }

  if (!data.success || !("songs" in data)) {
    const failure = data as Extract<RecognizeResponse, { success: false }>;
    return {
      ok: false,
      success: false,
      error: failure.error,
      reason: failure.message || failure.reason || "Could not confidently identify audio",
    };
  }

  return {
    ok: true,
    success: true,
    songs: data.songs,
    source: data.source,
    confidence: data.confidence,
  };
}
