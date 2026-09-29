import type { SongResult } from "@/lib/types";

const CONFIDENCE_THRESHOLD = 70;

type ShazamImageBag = {
  coverarthq?: string;
  coverart?: string;
  background?: string;
};

type ShazamMatch = {
  id?: string;
  offset?: number;
  timeskew?: number;
  frequencyskew?: number;
  score?: number;
  confidence?: number;
  probability?: number;
};

type ShazamTrack = {
  title?: string;
  subtitle?: string;
  images?: ShazamImageBag;
  share?: { image?: string; subject?: string };
  sections?: Array<{
    type?: string;
    metadata?: Array<{ title?: string; text?: string }>;
  }>;
};

type ShazamRecognizePayload = {
  track?: ShazamTrack;
  matches?: ShazamMatch[];
  score?: number;
  confidence?: number;
  probability?: number;
};

export class LowConfidenceError extends Error {
  readonly code = "LOW_CONFIDENCE" as const;

  constructor(message = "Could not confidently identify audio") {
    super(message);
    this.name = "LowConfidenceError";
  }
}

function extractAlbum(track: ShazamTrack): string | undefined {
  const songSection = track.sections?.find((section) => section.type === "SONG");
  const albumMeta = songSection?.metadata?.find(
    (item) => item.title?.toLowerCase() === "album",
  );
  return albumMeta?.text;
}

function extractYear(track: ShazamTrack): number | undefined {
  const songSection = track.sections?.find((section) => section.type === "SONG");
  const released = songSection?.metadata?.find(
    (item) => item.title?.toLowerCase() === "released",
  )?.text;
  if (!released) return undefined;
  const year = Number.parseInt(released.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}

export function mapShazamTrack(track: ShazamTrack): SongResult | null {
  const title = track.title?.trim();
  const artist = track.subtitle?.trim();
  if (!title || !artist) return null;

  return {
    title,
    artist,
    album: extractAlbum(track),
    year: extractYear(track),
    albumArt:
      track.images?.coverarthq ??
      track.images?.coverart ??
      track.share?.image,
  };
}

/**
 * Normalize score-like values to a 0–100 percentage.
 * Accepts 0–1 fractions or 0–100 percentages.
 */
function toPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= 0 && value <= 1) return value * 100;
  return Math.max(0, Math.min(100, value));
}

/**
 * Pull a confidence percentage from common Shazam / RapidAPI shapes.
 * Falls back to match skew heuristics when no explicit score exists.
 */
export function extractConfidence(payload: ShazamRecognizePayload): number | null {
  const topLevel =
    payload.confidence ?? payload.score ?? payload.probability;
  if (typeof topLevel === "number") {
    return toPercent(topLevel);
  }

  const match = payload.matches?.[0];
  if (!match) return null;

  const explicit =
    match.confidence ?? match.score ?? match.probability;
  if (typeof explicit === "number") {
    return toPercent(explicit);
  }

  // Heuristic: large time/frequency skew ⇒ weaker fingerprint match (humming).
  const timeSkew = Math.abs(match.timeskew ?? 0);
  const freqSkew = Math.abs(match.frequencyskew ?? 0);
  if (timeSkew === 0 && freqSkew === 0) {
    // Present match with no skew signal — treat as strong enough.
    return 85;
  }

  const penalty = timeSkew * 5000 + freqSkew * 8000;
  return Math.max(0, Math.min(100, 95 - penalty));
}

export type ShazamRecognition = {
  song: SongResult;
  confidence: number;
};

/**
 * Forward audio to Shazam Core on RapidAPI.
 * Rejects missing/low-confidence matches so we never surface a wrong song.
 */
export async function recognizeWithShazam(
  audio: Blob,
): Promise<ShazamRecognition> {
  const apiKey = process.env.RAPIDAPI_KEY;
  const host =
    process.env.RAPIDAPI_HOST?.trim() || "shazam-core.p.rapidapi.com";

  if (!apiKey) {
    throw new Error("RAPIDAPI_KEY is not configured on the server.");
  }

  const formData = new FormData();
  const extension =
    audio.type.includes("ogg")
      ? "ogg"
      : audio.type.includes("mp3") || audio.type.includes("mpeg")
        ? "mp3"
        : audio.type.includes("wav")
          ? "wav"
          : "webm";

  formData.append("file", audio, `sample.${extension}`);

  const response = await fetch(`https://${host}/v1/tracks/recognize`, {
    method: "POST",
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": host,
      // Intentionally omit Content-Type so fetch sets multipart boundary.
    },
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Shazam recognition failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`,
    );
  }

  const payload = (await response.json()) as ShazamRecognizePayload;
  const matches = payload.matches ?? [];
  const mapped = payload.track ? mapShazamTrack(payload.track) : null;

  if (!mapped || matches.length === 0) {
    throw new LowConfidenceError();
  }

  const confidence = extractConfidence(payload);
  if (confidence === null || confidence < CONFIDENCE_THRESHOLD) {
    throw new LowConfidenceError();
  }

  return { song: mapped, confidence };
}
