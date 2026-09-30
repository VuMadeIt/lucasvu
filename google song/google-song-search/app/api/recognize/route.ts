import { NextResponse } from "next/server";
import { recognizeWithAcrCloud } from "@/lib/acrcloud";
import { recognizeWithAudd } from "@/lib/audd";
import { fetchMultiSourceCandidates } from "@/lib/musicSources";
import { rankCandidates } from "@/lib/scoreCandidates";
import { searchByText } from "@/lib/searchByText";
import {
  EXACT_MATCH_CONFIDENCE,
  LowConfidenceError,
  recognizeWithShazam,
} from "@/lib/shazam";
import type { PowerSearchClues } from "@/lib/powerSearchTypes";
import type {
  RecognizeFailure,
  RecognizeResponse,
  SongResult,
} from "@/lib/types";

export const runtime = "nodejs";

const NO_MATCH_MESSAGE =
  "Audio could not be identified. Switching to Power Search.";

function noMatchPayload(): RecognizeFailure {
  return {
    success: false,
    ok: false,
    status: "NO_MATCH",
    triggerPowerSearch: true,
    error: "NO_MATCH",
    message: NO_MATCH_MESSAGE,
    reason: NO_MATCH_MESSAGE,
  };
}

function failure(
  error: RecognizeFailure["error"],
  message: string,
  status = 200,
  extra: Partial<RecognizeFailure> = {},
) {
  const body: RecognizeFailure = {
    success: false,
    ok: false,
    error,
    message,
    reason: message,
    ...extra,
  };
  return NextResponse.json(body, { status });
}

function useful(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && !/^any(\s|$)/i.test(trimmed);
}

/**
 * Power Search text clues that should skip fingerprint matching.
 * lyrics / genre / songSection (era alone still allows audio passes).
 */
function hasTextClues(clues: PowerSearchClues) {
  return (
    useful(clues.lyrics) || useful(clues.genre) || useful(clues.songSection)
  );
}

function parseClues(formData: FormData): PowerSearchClues {
  return {
    lyrics: String(formData.get("lyrics") ?? ""),
    genre: String(formData.get("genre") ?? "any"),
    era: String(formData.get("era") ?? "any"),
    songSection: String(formData.get("songSection") ?? "any"),
  };
}

/**
 * Multi-source weighted search (Spotify/iTunes), with iTunes-only fallback.
 */
async function runTextPowerSearch(clues: PowerSearchClues): Promise<SongResult[]> {
  try {
    const candidates = await fetchMultiSourceCandidates(clues);
    if (candidates.length > 0) {
      return rankCandidates(candidates, clues, 5).map((result) => ({
        title: result.title,
        artist: result.artist,
        album: result.album,
        year: result.year,
        albumArt: result.albumArt,
        matchPercent: result.matchPercentage,
      }));
    }
  } catch (error) {
    console.warn("[recognize] Multi-source power search failed", error);
  }

  try {
    const itunes = await searchByText(
      clues.lyrics,
      clues.genre,
      clues.era,
      clues.songSection,
    );
    return itunes.slice(0, 5).map((song, index) => ({
      ...song,
      matchPercent:
        song.matchPercent ?? Math.max(40, 92 - index * 12),
    }));
  } catch (error) {
    console.warn("[recognize] iTunes text fallback failed", error);
    return [];
  }
}

type ExactHit = {
  song: SongResult;
  confidence: number;
  source: "shazam" | "audd";
};

async function pass1ExactMatch(audio: Blob): Promise<ExactHit | null> {
  try {
    const result = await recognizeWithShazam(audio);
    if (result.confidence > EXACT_MATCH_CONFIDENCE - 1e-9) {
      return {
        song: result.song,
        confidence: result.confidence,
        source: "shazam",
      };
    }
  } catch (error) {
    const isLow = error instanceof LowConfidenceError;
    console.warn(
      `[recognize] Shazam ${isLow ? "low-confidence" : "miss/fail"}`,
      error,
    );
  }

  try {
    const audd = await recognizeWithAudd(audio);
    if (audd && audd.confidence > EXACT_MATCH_CONFIDENCE - 1e-9) {
      return {
        song: audd.song,
        confidence: audd.confidence,
        source: "audd",
      };
    }
  } catch (error) {
    console.warn("[recognize] AudD miss/fail", error);
  }

  return null;
}

async function pass2Humming(audio: Blob): Promise<SongResult[]> {
  try {
    return await recognizeWithAcrCloud(audio);
  } catch (error) {
    console.warn("[recognize] ACRCloud miss/fail", error);
    return [];
  }
}

export async function POST(request: Request) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return failure(
        "SERVER_ERROR",
        "Request must be multipart form data with an audio field.",
        400,
      );
    }

    const clues = parseClues(formData);
    const audio = formData.get("audio");
    const hasAudio = audio instanceof Blob && audio.size > 0;

    // Power Search clues → bypass fingerprint matching, use text/multi-source ranking
    if (hasTextClues(clues)) {
      const songs = await runTextPowerSearch(clues);
      if (songs.length === 0) {
        return failure(
          "NO_MATCH",
          "No songs matched those Power Search clues.",
          200,
          { status: "NO_MATCH", triggerPowerSearch: true },
        );
      }

      const body: RecognizeResponse = {
        success: true,
        ok: true,
        status: "CANDIDATES",
        searchMode: "power",
        source: "itunes",
        songs,
      };
      return NextResponse.json(body);
    }

    if (!hasAudio) {
      return NextResponse.json(noMatchPayload());
    }

    // Pass 1: Shazam / AudD exact audio matching
    const exact = await pass1ExactMatch(audio);
    if (exact) {
      const body: RecognizeResponse = {
        success: true,
        ok: true,
        status: "EXACT_MATCH",
        searchMode: "quick",
        source: exact.source,
        song: exact.song,
        songs: [exact.song],
        confidence: exact.confidence,
      };
      return NextResponse.json(body);
    }

    // Pass 2: ACRCloud humming fallback
    const candidates = await pass2Humming(audio);
    if (candidates.length > 0) {
      const body: RecognizeResponse = {
        success: true,
        ok: true,
        status: "CANDIDATES",
        searchMode: "quick",
        source: "acrcloud",
        songs: candidates,
      };
      return NextResponse.json(body);
    }

    return NextResponse.json(noMatchPayload());
  } catch (error) {
    console.error("[recognize] Unexpected error", error);
    return NextResponse.json(noMatchPayload());
  }
}
