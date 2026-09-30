export type PowerSearchClues = {
  lyrics: string;
  songSection: string;
  genre: string;
  era: string;
};

export type LlmSongGuess = {
  title: string;
  artist: string;
  matchPercentage: number;
  reasoning: string;
};

export type PowerSearchResult = {
  title: string;
  artist: string;
  matchPercentage: number;
  reasoning: string;
  album?: string;
  year?: number;
  albumArt?: string;
  previewUrl?: string;
  appleMusicUrl?: string;
  spotifyUrl?: string;
};

export type PowerSearchResponse =
  | { ok: true; results: PowerSearchResult[] }
  | { ok: false; error: string; message: string };
