import { fuzzyLyricScore } from "@/lib/fuzzyMatch";
import type { MusicCandidate } from "@/lib/musicSources";
import type { PowerSearchClues, PowerSearchResult } from "@/lib/powerSearchTypes";

const WEIGHTS = {
  lyric: 0.4,
  genre: 0.3,
  era: 0.3,
} as const;

function useful(value?: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed && !/^any(\s|$)/i.test(trimmed) ? trimmed.toLowerCase() : "";
}

function yearToDecade(year?: number): string | null {
  if (!year || !Number.isFinite(year)) return null;
  if (year < 1970) return "older";
  const decadeStart = Math.floor(year / 10) * 10;
  return `${decadeStart}s`;
}

function normalizeGenre(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function genreMatchScore(requested: string, genres: string[]): number {
  const want = useful(requested);
  if (!want) return 0.5; // neutral when genre filter unused
  if (genres.length === 0) return 0.15;

  const wantNorm = normalizeGenre(want);
  let best = 0;
  for (const genre of genres) {
    const got = normalizeGenre(genre);
    if (!got) continue;
    if (got === wantNorm || got.includes(wantNorm) || wantNorm.includes(got)) {
      best = 1;
      break;
    }
    // light fuzzy for near matches (r&b / rnb, hip-hop / hip hop)
    const compactWant = wantNorm.replace(/[\s&-]/g, "");
    const compactGot = got.replace(/[\s&-]/g, "");
    if (compactWant && compactGot.includes(compactWant)) {
      best = Math.max(best, 0.9);
    }
  }
  return best;
}

function eraMatchScore(requestedEra: string, year?: number): number {
  const want = useful(requestedEra);
  if (!want) return 0.5; // neutral when era unused
  const decade = yearToDecade(year);
  if (!decade) return 0.1;
  if (decade === want) return 1;
  // adjacent decade partial credit
  const wantStart = Number.parseInt(want, 10);
  const gotStart = Number.parseInt(decade, 10);
  if (Number.isFinite(wantStart) && Number.isFinite(gotStart)) {
    if (Math.abs(wantStart - gotStart) === 10) return 0.35;
  }
  if (want === "older" && (year ?? 9999) < 1970) return 1;
  return 0;
}

export type ScoredCandidate = MusicCandidate & {
  score: number;
  matchPercentage: number;
  reasoning: string;
  breakdown: {
    lyric: number;
    genre: number;
    era: number;
  };
};

/**
 * Weighted relevance:
 * Lyric Match 40% · Genre Match 30% · Era/Year Match 30%
 */
export function scoreCandidate(
  candidate: MusicCandidate,
  clues: PowerSearchClues,
): ScoredCandidate {
  const lyricHaystack = `${candidate.title} ${candidate.album ?? ""}`;
  const lyric = fuzzyLyricScore(clues.lyrics, lyricHaystack);
  const genre = genreMatchScore(clues.genre, candidate.genres);
  const era = eraMatchScore(clues.era, candidate.year);

  const score =
    lyric * WEIGHTS.lyric + genre * WEIGHTS.genre + era * WEIGHTS.era;
  const matchPercentage = Math.max(1, Math.min(99, Math.round(score * 100)));

  const reasons: string[] = [];
  if (lyric >= 0.55) reasons.push("lyric/title similarity");
  if (genre >= 0.7) reasons.push("genre alignment");
  if (era >= 0.7) reasons.push("era/decade match");
  if (reasons.length === 0) reasons.push("partial clue overlap");

  return {
    ...candidate,
    score,
    matchPercentage,
    reasoning: `Ranked via ${reasons.join(", ")}.`,
    breakdown: { lyric, genre, era },
  };
}

export function rankCandidates(
  candidates: MusicCandidate[],
  clues: PowerSearchClues,
  limit = 5,
): PowerSearchResult[] {
  return candidates
    .map((candidate) => scoreCandidate(candidate, clues))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({
      title: item.title,
      artist: item.artist,
      matchPercentage: item.matchPercentage,
      reasoning: item.reasoning,
      album: item.album,
      year: item.year,
      albumArt: item.albumArt,
      previewUrl: item.previewUrl,
      appleMusicUrl: item.appleMusicUrl,
      spotifyUrl: item.spotifyUrl,
    }));
}
