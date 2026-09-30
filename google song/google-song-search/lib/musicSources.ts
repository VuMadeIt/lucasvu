export type MusicCandidate = {
  id: string;
  source: "itunes" | "spotify";
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genres: string[];
  albumArt?: string;
  previewUrl?: string;
  appleMusicUrl?: string;
  spotifyUrl?: string;
};

function useful(value?: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed && !/^any(\s|$)/i.test(trimmed) ? trimmed : "";
}

export function buildMusicQuery(clues: {
  lyrics: string;
  genre: string;
  era: string;
  songSection: string;
}): string {
  const lyrics = useful(clues.lyrics);
  const genre = useful(clues.genre);
  const era = useful(clues.era);
  const section = useful(clues.songSection);

  // Spotify-style query; iTunes also accepts the free-text form.
  const parts = [
    lyrics,
    genre ? `genre:"${genre}"` : "",
    era,
    section && section !== "Not sure" ? section : "",
  ].filter(Boolean);

  return parts.join(" ").trim() || "popular songs";
}

type ITunesTrack = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  releaseDate?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  previewUrl?: string;
  trackViewUrl?: string;
};

export async function fetchItunesCandidates(
  query: string,
  limit = 25,
): Promise<MusicCandidate[]> {
  const url = new URL("https://itunes.apple.com/search");
  // iTunes ignores Spotify operators; strip genre:"..." quotes for broader recall.
  const itunesTerm = query.replace(/genre:"([^"]+)"/gi, "$1");
  url.searchParams.set("term", itunesTerm);
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("media", "music");

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!response.ok) return [];

  const data = (await response.json()) as { results?: ITunesTrack[] };
  return (data.results ?? [])
    .map((track): MusicCandidate | null => {
      if (!track.trackName || !track.artistName) return null;
      const year = track.releaseDate
        ? Number.parseInt(track.releaseDate.slice(0, 4), 10)
        : undefined;
      const artwork = track.artworkUrl100 ?? track.artworkUrl60;

      return {
        id: `itunes-${track.trackId ?? `${track.artistName}-${track.trackName}`}`,
        source: "itunes",
        title: track.trackName,
        artist: track.artistName,
        album: track.collectionName,
        year: Number.isFinite(year) ? year : undefined,
        genres: track.primaryGenreName ? [track.primaryGenreName] : [],
        albumArt: artwork
          ? artwork.replace("100x100bb", "600x600bb")
          : undefined,
        previewUrl: track.previewUrl,
        appleMusicUrl: track.trackViewUrl,
        spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(
          `${track.artistName} ${track.trackName}`,
        )}`,
      };
    })
    .filter((item): item is MusicCandidate => item !== null);
}

let spotifyTokenCache: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expiresAt) {
    return spotifyTokenCache.token;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) return null;
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;

  spotifyTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  };
  return data.access_token;
}

type SpotifyTrack = {
  id?: string;
  name?: string;
  preview_url?: string | null;
  external_urls?: { spotify?: string };
  album?: {
    name?: string;
    release_date?: string;
    images?: Array<{ url?: string }>;
  };
  artists?: Array<{ id?: string; name?: string }>;
};

type SpotifyArtist = {
  id?: string;
  genres?: string[];
};

async function fetchSpotifyArtistGenres(
  token: string,
  artistIds: string[],
): Promise<Map<string, string[]>> {
  const unique = [...new Set(artistIds)].filter(Boolean).slice(0, 20);
  const map = new Map<string, string[]>();
  if (unique.length === 0) return map;

  const response = await fetch(
    `https://api.spotify.com/v1/artists?ids=${unique.join(",")}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return map;

  const data = (await response.json()) as { artists?: SpotifyArtist[] };
  for (const artist of data.artists ?? []) {
    if (artist.id) map.set(artist.id, artist.genres ?? []);
  }
  return map;
}

export async function fetchSpotifyCandidates(
  query: string,
  limit = 20,
): Promise<MusicCandidate[]> {
  const token = await getSpotifyToken();
  if (!token) return [];

  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return [];

  const data = (await response.json()) as {
    tracks?: { items?: SpotifyTrack[] };
  };
  const tracks = data.tracks?.items ?? [];
  const artistIds = tracks
    .map((track) => track.artists?.[0]?.id)
    .filter((id): id is string => Boolean(id));
  const genreMap = await fetchSpotifyArtistGenres(token, artistIds);

  return tracks
    .map((track): MusicCandidate | null => {
      if (!track.name || !track.artists?.[0]?.name) return null;
      const year = track.album?.release_date
        ? Number.parseInt(track.album.release_date.slice(0, 4), 10)
        : undefined;
      const primaryArtistId = track.artists[0].id;

      return {
        id: `spotify-${track.id ?? `${track.artists[0].name}-${track.name}`}`,
        source: "spotify",
        title: track.name,
        artist: track.artists.map((a) => a.name).filter(Boolean).join(", "),
        album: track.album?.name,
        year: Number.isFinite(year) ? year : undefined,
        genres: primaryArtistId ? genreMap.get(primaryArtistId) ?? [] : [],
        albumArt: track.album?.images?.[0]?.url,
        previewUrl: track.preview_url ?? undefined,
        spotifyUrl:
          track.external_urls?.spotify ??
          `https://open.spotify.com/search/${encodeURIComponent(
            `${track.artists[0].name} ${track.name}`,
          )}`,
      };
    })
    .filter((item): item is MusicCandidate => item !== null);
}

/**
 * Query Spotify (when configured) and iTunes in parallel, then de-dupe.
 */
export async function fetchMultiSourceCandidates(clues: {
  lyrics: string;
  genre: string;
  era: string;
  songSection: string;
}): Promise<MusicCandidate[]> {
  const query = buildMusicQuery(clues);
  const [spotify, itunes] = await Promise.all([
    fetchSpotifyCandidates(query),
    fetchItunesCandidates(query),
  ]);

  const merged = [...spotify, ...itunes];
  const seen = new Set<string>();
  const unique: MusicCandidate[] = [];

  for (const candidate of merged) {
    const key = `${candidate.title.toLowerCase()}::${candidate.artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}
