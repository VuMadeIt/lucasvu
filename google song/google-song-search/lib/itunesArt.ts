import "server-only";

import type { SongResult } from "@/lib/types";

type ITunesTrack = {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
};

/**
 * Resolve high-res cover art (and fill album/year) via public iTunes Search.
 */
export async function enrichSongWithItunes(input: {
  title: string;
  artist: string;
  album?: string;
  year?: number;
}): Promise<SongResult> {
  const term = encodeURIComponent(`${input.artist} ${input.title}`);
  const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=1`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!response.ok) {
      return {
        title: input.title,
        artist: input.artist,
        album: input.album,
        year: input.year,
      };
    }

    const data = (await response.json()) as { results?: ITunesTrack[] };
    const track = data.results?.[0];
    const artwork = track?.artworkUrl100
      ? track.artworkUrl100.replace("100x100bb", "600x600bb")
      : undefined;
    const year = track?.releaseDate
      ? Number.parseInt(track.releaseDate.slice(0, 4), 10)
      : input.year;

    return {
      title: input.title,
      artist: input.artist,
      album: track?.collectionName ?? input.album,
      year: Number.isFinite(year) ? year : input.year,
      albumArt: artwork,
      matchPercent: 92,
    };
  } catch {
    return {
      title: input.title,
      artist: input.artist,
      album: input.album,
      year: input.year,
      matchPercent: 90,
    };
  }
}
