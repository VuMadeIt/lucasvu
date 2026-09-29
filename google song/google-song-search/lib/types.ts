export type SongResult = {
  title: string;
  artist: string;
  album?: string;
  year?: number;
  albumArt?: string;
  matchPercent?: number;
};

export type RecognizeSuccess = {
  success: true;
  ok: true;
  source: "shazam" | "itunes" | "mock";
  songs: SongResult[];
  confidence?: number;
};

export type RecognizeFailure = {
  success: false;
  ok: false;
  error: "LOW_CONFIDENCE" | "NO_MATCH" | "SEARCH_FAILED" | "SERVER_ERROR";
  message: string;
  /** @deprecated Prefer `message` — kept for older clients */
  reason: string;
};

export type RecognizeResponse = RecognizeSuccess | RecognizeFailure;
