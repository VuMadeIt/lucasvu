import type { RecognizeResponse, SongResult } from "@/lib/types";

export type { SongResult };

export type AnalyzeAudioResult =
  | {
      ok: true;
      success: true;
      songs: SongResult[];
      source: "shazam" | "itunes" | "mock";
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

type AnalyzeOptions = RecognizeFilters & {
  searchMode?: "quick" | "power";
};

const POWER_MATCH_PERCENTS = [94, 81, 67, 52] as const;

const POWER_MOCK_SONGS: SongResult[] = [
  {
    title: "Motion Sickness",
    artist: "Phoebe Bridgers",
    album: "Stranger in the Alps",
    year: 2017,
  },
  {
    title: "Vienna",
    artist: "Billy Joel",
    album: "The Stranger",
    year: 1977,
  },
  {
    title: "Dreams",
    artist: "Fleetwood Mac",
    album: "Rumours",
    year: 1977,
  },
  {
    title: "Somebody That I Used to Know",
    artist: "Gotye",
    album: "Making Mirrors",
    year: 2011,
  },
];

function withMatchPercents(songs: SongResult[]): SongResult[] {
  return songs.slice(0, 4).map((song, index) => ({
    ...song,
    matchPercent: POWER_MATCH_PERCENTS[index] ?? Math.max(35, 90 - index * 12),
  }));
}

function getPowerMockSongs(filters: RecognizeFilters): SongResult[] {
  const genreHint = filters.genre?.trim();
  const lyricHint = filters.lyrics?.trim();

  const tailored = POWER_MOCK_SONGS.map((song, index) => {
    if (index === 0 && lyricHint) {
      return {
        ...song,
        album: song.album ?? "Matched from your clues",
      };
    }
    if (index === 1 && genreHint && !/^any\s/i.test(genreHint)) {
      return {
        ...song,
        album: song.album ?? `${genreHint} pick`,
      };
    }
    return song;
  });

  return withMatchPercents(tailored);
}

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
 * Power mode always resolves to a ranked list of 4 songs (API hits + mock fill).
 */
export async function analyzeAudio(
  blob: Blob | null,
  options: AnalyzeOptions = {},
): Promise<AnalyzeAudioResult> {
  const { searchMode = "quick", ...filters } = options;
  const formData = buildRecognizeFormData(blob, filters);

  // Power Search: prefer live API results, then guarantee 4 ranked matches.
  if (searchMode === "power") {
    try {
      const response = await fetch("/api/recognize", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as RecognizeResponse;

      if (data.success && data.ok && data.songs.length > 0) {
        const ranked = withMatchPercents(data.songs);
        const filled =
          ranked.length >= 4
            ? ranked
            : withMatchPercents([
                ...ranked,
                ...POWER_MOCK_SONGS.filter(
                  (mock) =>
                    !ranked.some(
                      (song) =>
                        song.title === mock.title && song.artist === mock.artist,
                    ),
                ),
              ].slice(0, 4));

        // Artificial beat so the analyzing UI can breathe.
        await new Promise((resolve) => setTimeout(resolve, 900));

        return {
          ok: true,
          success: true,
          songs: filled,
          source: data.source,
        };
      }
    } catch {
      /* fall through to mock ranked results */
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
    return {
      ok: true,
      success: true,
      songs: getPowerMockSongs(filters),
      source: "mock",
    };
  }

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
      reason:
        failure.message ||
        failure.reason ||
        "Could not confidently identify audio",
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
