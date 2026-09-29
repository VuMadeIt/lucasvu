import type { SongResult } from "@/lib/types";

type ShazamImageBag = {
  coverarthq?: string;
  coverart?: string;
  background?: string;
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
  matches?: unknown[];
};

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
 * Forward audio to Shazam Core on RapidAPI.
 * Key stays server-side via RAPIDAPI_KEY.
 */
export async function recognizeWithShazam(audio: Blob): Promise<SongResult> {
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
  const mapped = payload.track ? mapShazamTrack(payload.track) : null;

  if (!mapped) {
    throw new Error("Shazam returned no matching track.");
  }

  return mapped;
}
