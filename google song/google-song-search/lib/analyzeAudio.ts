export type SongResult = {
  title: string;
  artist: string;
  album?: string;
  year?: number;
};

export type AnalyzeAudioResult =
  | { ok: true; song: SongResult }
  | { ok: false; reason: string };

const FAKE_SONGS: SongResult[] = [
  {
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    year: 2019,
  },
  {
    title: "Levitating",
    artist: "Dua Lipa",
    album: "Future Nostalgia",
    year: 2020,
  },
  {
    title: "As It Was",
    artist: "Harry Styles",
    album: "Harry's House",
    year: 2022,
  },
  {
    title: "good 4 u",
    artist: "Olivia Rodrigo",
    album: "SOUR",
    year: 2021,
  },
];

/**
 * Mock Stage 1 / Stage 2 audio analysis.
 * Fakes a ~3s network round-trip, then randomly succeeds or fails.
 */
export async function analyzeAudio(_blob: Blob | null): Promise<AnalyzeAudioResult> {
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const succeeds = Math.random() > 0.45;

  if (succeeds) {
    const song = FAKE_SONGS[Math.floor(Math.random() * FAKE_SONGS.length)];
    return { ok: true, song };
  }

  return {
    ok: false,
    reason: "Couldn't identify that tune. Try again with more clues.",
  };
}
