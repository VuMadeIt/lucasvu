import "server-only";

import { createHmac } from "crypto";
import type { SongResult } from "@/lib/types";

const ENDPOINT = "/v1/identify";
const SIGNATURE_VERSION = "1";
const DATA_TYPE = "audio";

type AcrArtist = { name?: string };
type AcrTrack = {
  title?: string;
  artists?: AcrArtist[];
  album?: { name?: string };
  release_date?: string;
  score?: number;
  genres?: Array<{ name?: string }>;
};

type AcrPayload = {
  status?: { code?: number; msg?: string };
  metadata?: {
    music?: AcrTrack[];
    humming?: AcrTrack[];
  };
};

function isConfigured() {
  return Boolean(
    process.env.ACRCLOUD_HOST?.trim() &&
      process.env.ACRCLOUD_ACCESS_KEY?.trim() &&
      process.env.ACRCLOUD_ACCESS_SECRET?.trim(),
  );
}

function sign(stringToSign: string, accessSecret: string) {
  return createHmac("sha1", accessSecret)
    .update(Buffer.from(stringToSign, "utf-8"))
    .digest("base64");
}

function toMatchPercent(score?: number): number {
  if (typeof score !== "number" || !Number.isFinite(score)) return 55;
  // ACRCloud scores are typically 0–100.
  if (score >= 0 && score <= 1) return Math.round(score * 100);
  return Math.max(1, Math.min(99, Math.round(score)));
}

function mapTrack(track: AcrTrack): SongResult | null {
  const title = track.title?.trim();
  const artist = track.artists?.[0]?.name?.trim();
  if (!title || !artist) return null;

  const year = track.release_date
    ? Number.parseInt(track.release_date.slice(0, 4), 10)
    : undefined;
  const matchPercent = toMatchPercent(track.score);

  return {
    title,
    artist,
    album: track.album?.name,
    year: Number.isFinite(year) ? year : undefined,
    matchPercent,
  };
}

/**
 * Pass 2: ACRCloud humming / pitch-contour identification.
 * No-ops (empty list) when credentials are missing so the route can fall through cleanly.
 */
export async function recognizeWithAcrCloud(
  audio: Blob,
): Promise<SongResult[]> {
  if (!isConfigured()) return [];

  const host = process.env.ACRCLOUD_HOST!.trim().replace(/^https?:\/\//, "");
  const accessKey = process.env.ACRCLOUD_ACCESS_KEY!.trim();
  const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET!.trim();

  const timestamp = String(Math.floor(Date.now() / 1000));
  const stringToSign = [
    "POST",
    ENDPOINT,
    accessKey,
    DATA_TYPE,
    SIGNATURE_VERSION,
    timestamp,
  ].join("\n");
  const signature = sign(stringToSign, accessSecret);

  const sampleBytes = audio.size;
  const form = new FormData();
  form.append("sample", audio, "sample.webm");
  form.append("sample_bytes", String(sampleBytes));
  form.append("access_key", accessKey);
  form.append("data_type", DATA_TYPE);
  form.append("signature_version", SIGNATURE_VERSION);
  form.append("signature", signature);
  form.append("timestamp", timestamp);

  const response = await fetch(`https://${host}${ENDPOINT}`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `ACRCloud recognition failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`,
    );
  }

  const payload = (await response.json()) as AcrPayload;
  // 0 = success; 1001 = no result — both are non-fatal for our fallback chain.
  const code = payload.status?.code;
  if (code !== undefined && code !== 0) {
    return [];
  }

  const tracks = [
    ...(payload.metadata?.humming ?? []),
    ...(payload.metadata?.music ?? []),
  ];

  const seen = new Set<string>();
  const songs: SongResult[] = [];
  for (const track of tracks) {
    const mapped = mapTrack(track);
    if (!mapped) continue;
    const key = `${mapped.title.toLowerCase()}::${mapped.artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    songs.push(mapped);
  }

  return songs.sort(
    (a, b) => (b.matchPercent ?? 0) - (a.matchPercent ?? 0),
  );
}
