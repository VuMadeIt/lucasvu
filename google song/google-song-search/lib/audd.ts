import type { SongResult } from "@/lib/types";

type AuddAppleMusic = {
  artwork?: { url?: string };
  albumName?: string;
  releaseDate?: string;
};

type AuddResult = {
  title?: string;
  artist?: string;
  album?: string;
  release_date?: string;
  song_link?: string;
  apple_music?: AuddAppleMusic;
  spotify?: { album?: { images?: Array<{ url?: string }> } };
};

type AuddPayload = {
  status?: string;
  result?: AuddResult | null;
  error?: { error_code?: number; error_message?: string };
};

export type AuddRecognition = {
  song: SongResult;
  /** AudD rarely returns a numeric score; treat a hit as a strong exact match. */
  confidence: number;
};

function audioFilename(audio: Blob): string {
  const type = audio.type || "audio/webm";
  const extension = type.includes("ogg")
    ? "ogg"
    : type.includes("mp3") || type.includes("mpeg")
      ? "mp3"
      : type.includes("wav")
        ? "wav"
        : type.includes("mp4") || type.includes("m4a")
          ? "m4a"
          : "webm";
  return `sample.${extension}`;
}

/**
 * Exact-match Pass 1 via AudD (https://api.audd.io/).
 * Returns null when unconfigured, no match, or upstream error.
 */
export async function recognizeWithAudd(
  audio: Blob,
): Promise<AuddRecognition | null> {
  const token = process.env.AUDD_API_TOKEN?.trim();
  if (!token) return null;

  const form = new FormData();
  form.append("api_token", token);
  form.append("return", "apple_music,spotify");
  form.append("file", audio, audioFilename(audio));

  const response = await fetch("https://api.audd.io/", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `AudD recognition failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ""}`,
    );
  }

  const payload = (await response.json()) as AuddPayload;
  if (payload.status === "error" || !payload.result) {
    return null;
  }

  const result = payload.result;
  const title = result.title?.trim();
  const artist = result.artist?.trim();
  if (!title || !artist) return null;

  const yearRaw = result.release_date ?? result.apple_music?.releaseDate;
  const year = yearRaw ? Number.parseInt(yearRaw.slice(0, 4), 10) : undefined;

  const artworkTemplate = result.apple_music?.artwork?.url;
  const albumArt =
    (artworkTemplate
      ? artworkTemplate.replace("{w}", "600").replace("{h}", "600")
      : undefined) ?? result.spotify?.album?.images?.[0]?.url;

  return {
    confidence: 92,
    song: {
      title,
      artist,
      album: result.album ?? result.apple_music?.albumName,
      year: Number.isFinite(year) ? year : undefined,
      albumArt,
      matchPercent: 92,
    },
  };
}
