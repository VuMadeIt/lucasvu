import type { SongResult } from "@/lib/types";

type ITunesTrack = {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
};

type ITunesSearchResponse = {
  resultCount?: number;
  results?: ITunesTrack[];
};

const SONG_SECTION_QUERY: Record<string, string> = {
  chorus: "chorus hook",
  verse: "verse",
  bridge: "bridge",
  intro: "intro outro",
};

function mapITunesTrack(track: ITunesTrack): SongResult | null {
  if (!track.trackName || !track.artistName) return null;

  const year = track.releaseDate
    ? Number.parseInt(track.releaseDate.slice(0, 4), 10)
    : undefined;

  const artwork = track.artworkUrl100 ?? track.artworkUrl60;
  const albumArt = artwork ? artwork.replace("100x100bb", "600x600bb") : undefined;

  return {
    title: track.trackName,
    artist: track.artistName,
    album: track.collectionName,
    year: Number.isFinite(year) ? year : undefined,
    albumArt,
  };
}

function isUsefulFilter(value?: string) {
  const trimmed = value?.trim() ?? "";
  return Boolean(trimmed) && !/^any(\s|$)/i.test(trimmed);
}

/**
 * Power Search via the public iTunes Search API (no API key required).
 */
export async function searchByText(
  lyrics: string,
  genre: string,
  era?: string,
  songSection?: string,
): Promise<SongResult[]> {
  const sectionQuery = isUsefulFilter(songSection)
    ? SONG_SECTION_QUERY[songSection!.trim()] ?? songSection!.trim()
    : "";

  const parts = [
    lyrics.trim(),
    genre.trim(),
    era?.trim(),
    sectionQuery,
  ].filter((part) => isUsefulFilter(part));

  const term = parts.join(" ").trim();
  if (!term) return [];

  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "5");
  url.searchParams.set("media", "music");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`iTunes search failed (${response.status})`);
  }

  const data = (await response.json()) as ITunesSearchResponse;
  const songs =
    data.results
      ?.map(mapITunesTrack)
      .filter((song): song is SongResult => song !== null) ?? [];

  return songs;
}
