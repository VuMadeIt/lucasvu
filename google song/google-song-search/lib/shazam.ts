import "server-only";

import {
  getRapidApiHost,
  getRapidApiKey,
  safeProviderError,
} from "@/lib/secrets";

export const EXACT_MATCH_CONFIDENCE = 75;

export type BasicRecognition = {
  title: string;
  artist: string;
  album?: string;
  year?: number;
};

export class LowConfidenceError extends Error {
  readonly code = "LOW_CONFIDENCE" as const;

  constructor(message = "Could not confidently identify audio") {
    super(message);
    this.name = "LowConfidenceError";
  }
}

type RapidShazamTrack = {
  title?: string;
  subtitle?: string;
  images?: { coverarthq?: string; coverart?: string };
  sections?: Array<{
    type?: string;
    metadata?: Array<{ title?: string; text?: string }>;
  }>;
};

type RapidShazamPayload = {
  result?: {
    track?: RapidShazamTrack;
    matches?: unknown[];
  };
  track?: RapidShazamTrack;
  matches?: unknown[];
  message?: string;
  error?: string;
  status?: string | number;
};

function extractAlbum(track: RapidShazamTrack): string | undefined {
  const songSection = track.sections?.find((section) => section.type === "SONG");
  return songSection?.metadata?.find(
    (item) => item.title?.toLowerCase() === "album",
  )?.text;
}

function extractYear(track: RapidShazamTrack): number | undefined {
  const songSection = track.sections?.find((section) => section.type === "SONG");
  const released = songSection?.metadata?.find(
    (item) => item.title?.toLowerCase() === "released",
  )?.text;
  if (!released) return undefined;
  const year = Number.parseInt(released.slice(0, 4), 10);
  return Number.isFinite(year) ? year : undefined;
}

/**
 * Shazam via RapidAPI shazam-api6.
 * Re-packages browser webm bytes as an audio/wav-labeled Blob named recording.wav
 * (API rejects anonymous / unlabeled webm uploads).
 */
export async function recognizeWithShazam(
  audio: Blob,
): Promise<BasicRecognition | null> {
  const apiKey = getRapidApiKey();
  const host = getRapidApiHost();

  if (!apiKey) {
    throw safeProviderError("Shazam", undefined, "config");
  }

  const buffer = Buffer.from(await audio.arrayBuffer());
  const wavLabeledBlob = new Blob([buffer], { type: "audio/wav" });

  const form = new FormData();
  form.append("upload_file", wavLabeledBlob, "recording.wav");

  const response = await fetch(`https://${host}/shazam/recognize/`, {
    method: "POST",
    headers: {
      "x-rapidapi-key": apiKey,
      "x-rapidapi-host": host,
    },
    body: form,
  });

  const detail = await response.text().catch(() => "");
  let data: RapidShazamPayload | null = null;
  try {
    data = detail ? (JSON.parse(detail) as RapidShazamPayload) : null;
  } catch {
    data = null;
  }

  console.log("[Shazam Raw Response]:", JSON.stringify(data));

  if (!response.ok) {
    console.error("[shazam] HTTP failure", {
      status: response.status,
      fileSize: buffer.byteLength,
      bodyPreview: detail.slice(0, 200),
    });
    throw safeProviderError("Shazam", response.status, "http");
  }

  if (!data) {
    throw safeProviderError("Shazam", undefined, "parse");
  }

  const track = data.result?.track ?? data.track;
  const title = track?.title?.trim();
  const artist = track?.subtitle?.trim();
  if (!title || !artist) return null;

  return {
    title,
    artist,
    album: extractAlbum(track!),
    year: extractYear(track!),
  };
}
