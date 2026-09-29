import type { RecognizeResponse, SongResult } from "@/lib/types";

export type { SongResult };

export type AnalyzeAudioResult =
  | { ok: true; songs: SongResult[]; source: "shazam" | "itunes" }
  | { ok: false; reason: string };

type RecognizeFilters = {
  lyrics?: string;
  genre?: string;
  era?: string;
};

/**
 * Client-side helper: posts audio + Power Search filters to our secure API route.
 * The RapidAPI key never leaves the server.
 */
export async function analyzeAudio(
  blob: Blob | null,
  filters: RecognizeFilters = {},
): Promise<AnalyzeAudioResult> {
  const formData = new FormData();

  if (blob && blob.size > 0) {
    formData.append("audio", blob, "recording.webm");
  }

  if (filters.lyrics) formData.append("lyrics", filters.lyrics);
  if (filters.genre) formData.append("genre", filters.genre);
  if (filters.era) formData.append("era", filters.era);

  const response = await fetch("/api/recognize", {
    method: "POST",
    body: formData,
  });

  let data: RecognizeResponse;
  try {
    data = (await response.json()) as RecognizeResponse;
  } catch {
    return {
      ok: false,
      reason: "Couldn't read the recognition response.",
    };
  }

  if (!data.ok) {
    return { ok: false, reason: data.reason };
  }

  return {
    ok: true,
    songs: data.songs,
    source: data.source,
  };
}
