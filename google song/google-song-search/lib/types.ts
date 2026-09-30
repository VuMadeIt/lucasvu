export type SongResult = {
  title: string;
  artist: string;
  album?: string;
  year?: number;
  albumArt?: string;
  matchPercent?: number;
};

export type RecognizeStatus = "EXACT_MATCH" | "CANDIDATES" | "NO_MATCH";

export type RecognizeSuccess = {
  success: true;
  ok: true;
  status?: "EXACT_MATCH" | "CANDIDATES";
  searchMode?: "quick" | "power";
  source: "shazam" | "audd" | "acrcloud" | "itunes";
  /** Present on EXACT_MATCH responses */
  song?: SongResult;
  songs: SongResult[];
  confidence?: number;
};

export type RecognizeFailure = {
  success: false;
  ok: false;
  status?: "NO_MATCH";
  triggerPowerSearch?: boolean;
  error: "LOW_CONFIDENCE" | "NO_MATCH" | "SEARCH_FAILED" | "SERVER_ERROR";
  message: string;
  /** @deprecated Prefer `message` — kept for older clients */
  reason: string;
};

export type RecognizeResponse = RecognizeSuccess | RecognizeFailure;
