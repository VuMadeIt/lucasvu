export type SongResult = {
  title: string;
  artist: string;
  album?: string;
  year?: number;
  albumArt?: string;
};

export type RecognizeSuccess = {
  ok: true;
  source: "shazam" | "itunes";
  songs: SongResult[];
};

export type RecognizeFailure = {
  ok: false;
  reason: string;
};

export type RecognizeResponse = RecognizeSuccess | RecognizeFailure;
