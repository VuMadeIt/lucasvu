import "server-only";

import {
  getAuddApiKey,
  safeProviderError,
} from "@/lib/secrets";

type AuddResult = {
  title?: string;
  artist?: string;
  album?: string;
  release_date?: string;
};

type AuddPayload = {
  status?: string;
  result?: AuddResult | null;
  error?: { error_code?: number; error_message?: string };
};

export type BasicRecognition = {
  title: string;
  artist: string;
  album?: string;
  year?: number;
};

/**
 * AudD recognition — sends a named webm Blob built from a raw buffer.
 */
export async function recognizeWithAudd(
  audio: Blob,
): Promise<BasicRecognition | null> {
  const token = getAuddApiKey();
  if (!token) {
    throw safeProviderError("AudD", undefined, "config");
  }

  const buffer = Buffer.from(await audio.arrayBuffer());
  const fileBlob = new Blob([buffer], { type: "audio/webm" });

  const form = new FormData();
  form.append("api_token", token);
  form.append("return", "apple_music,spotify");
  form.append("file", fileBlob, "recording.webm");

  const response = await fetch("https://api.audd.io/", {
    method: "POST",
    body: form,
  });

  const detail = await response.text().catch(() => "");
  let data: AuddPayload | null = null;
  try {
    data = detail ? (JSON.parse(detail) as AuddPayload) : null;
  } catch {
    data = null;
  }

  console.log("[AudD Raw Response]:", JSON.stringify(data));

  if (!response.ok) {
    console.error("[audd] HTTP failure", {
      status: response.status,
      fileSize: buffer.byteLength,
    });
    throw safeProviderError("AudD", response.status, "http");
  }

  if (data?.status === "error") {
    const code = data.error?.error_code;
    const message = data.error?.error_message ?? "";
    console.error("[audd] API error payload", { code, message });
    if (
      code === 900 ||
      code === 901 ||
      /auth|token|quota|limit|expired|trial|payment|plan|rate/i.test(message)
    ) {
      throw safeProviderError("AudD", code, "auth");
    }
    throw safeProviderError("AudD", code, "unknown");
  }

  if (!data?.result) return null;

  const title = data.result.title?.trim();
  const artist = data.result.artist?.trim();
  if (!title || !artist) return null;

  const yearRaw = data.result.release_date;
  const year = yearRaw ? Number.parseInt(yearRaw.slice(0, 4), 10) : undefined;

  return {
    title,
    artist,
    album: data.result.album,
    year: Number.isFinite(year) ? year : undefined,
  };
}
