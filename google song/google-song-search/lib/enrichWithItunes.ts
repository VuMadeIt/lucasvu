import type {
  LlmSongGuess,
  PowerSearchResult,
} from "@/lib/powerSearchTypes";

type ITunesTrack = {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  releaseDate?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  previewUrl?: string;
  trackViewUrl?: string;
};

type ITunesSearchResponse = {
  results?: ITunesTrack[];
};

async function enrichOne(guess: LlmSongGuess): Promise<PowerSearchResult> {
  const term = `${guess.artist} ${guess.title}`.trim();
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "1");
  url.searchParams.set("media", "music");

  const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(term)}`;

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      return {
        ...guess,
        spotifyUrl,
      };
    }

    const data = (await response.json()) as ITunesSearchResponse;
    const track = data.results?.[0];
    if (!track) {
      return {
        ...guess,
        spotifyUrl,
      };
    }

    const artwork = track.artworkUrl100 ?? track.artworkUrl60;
    const year = track.releaseDate
      ? Number.parseInt(track.releaseDate.slice(0, 4), 10)
      : undefined;

    return {
      title: track.trackName || guess.title,
      artist: track.artistName || guess.artist,
      matchPercentage: guess.matchPercentage,
      reasoning: guess.reasoning,
      album: track.collectionName,
      year: Number.isFinite(year) ? year : undefined,
      albumArt: artwork
        ? artwork.replace("100x100bb", "600x600bb")
        : undefined,
      previewUrl: track.previewUrl,
      appleMusicUrl: track.trackViewUrl,
      spotifyUrl,
    };
  } catch {
    return {
      ...guess,
      spotifyUrl,
    };
  }
}

/**
 * Parallel iTunes lookups for album art, preview audio, and store links.
 */
export async function enrichWithItunes(
  guesses: LlmSongGuess[],
): Promise<PowerSearchResult[]> {
  return Promise.all(guesses.map((guess) => enrichOne(guess)));
}
