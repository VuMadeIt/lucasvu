import "server-only";

import { NextResponse } from "next/server";
import { recognizeWithAudd } from "@/lib/audd";
import { enrichSongWithItunes } from "@/lib/itunesArt";
import { fetchMultiSourceCandidates } from "@/lib/musicSources";
import { rankCandidates } from "@/lib/scoreCandidates";
import { searchByText } from "@/lib/searchByText";
import { getActiveAudioApi } from "@/lib/secrets";
import { recognizeWithShazam } from "@/lib/shazam";
import type { PowerSearchClues } from "@/lib/powerSearchTypes";
import type {
  RecognizeFailure,
  RecognizeResponse,
  SongResult,
} from "@/lib/types";

export const runtime = "nodejs";

const NO_MATCH_MESSAGE =
  "Audio could not be identified. Switching to Power Search.";

/** Minimum composite score (0–100) for Power Search text results to count as a hit. */
const MIN_POWER_MATCH_PERCENT = 55;

type ProviderAttemptLog = {
  provider: "audd" | "shazam";
  outcome: "match" | "empty" | "error";
  detail?: string;
};

function noMatchPayload(): RecognizeFailure & { success: false } {
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

function returnNoMatch(reason: string, diagnostics?: unknown) {
  console.error("[recognize] Returning success:false —", reason, diagnostics ?? "");
  return NextResponse.json(noMatchPayload());
}

async function runTextPowerSearch(clues: PowerSearchClues): Promise<SongResult[]> {
  try {
    const candidates = await fetchMultiSourceCandidates(clues);
    if (candidates.length > 0) {
      return rankCandidates(candidates, clues, 5)
        .filter((result) => result.matchPercentage >= MIN_POWER_MATCH_PERCENT)
        .map((result) => ({
          title: result.title,
          artist: result.artist,
          album: result.album,
          year: result.year,
          albumArt: result.albumArt,
          matchPercent: result.matchPercentage,
        }));
    }
  } catch (error) {
    console.error("[recognize] Multi-source power search failed", error);
  }

  try {
    const itunes = await searchByText(
      clues.lyrics,
      clues.genre,
      clues.era,
      clues.songSection,
    );
    // iTunes text hits without a scored composite — require at least one real track
    // but do not invent match percents from mock tables.
    return itunes.slice(0, 5).map((song) => ({
      ...song,
      matchPercent: song.matchPercent,
    }));
  } catch (error) {
    console.error("[recognize] iTunes text fallback failed", error);
    return [];
  }
}

type BasicHit = {
  title: string;
  artist: string;
  album?: string;
  year?: number;
};

async function recognizeAudioWithFailover(
  audio: Blob,
): Promise<{
  hit: BasicHit | null;
  source: "audd" | "shazam" | null;
  attempts: ProviderAttemptLog[];
}> {
  const primary = getActiveAudioApi();
  const attempts: ProviderAttemptLog[] = [];

  const tryAudd = async () => {
    try {
      const hit = await recognizeWithAudd(audio);
      if (hit) {
        attempts.push({ provider: "audd", outcome: "match" });
        return hit;
      }
      attempts.push({
        provider: "audd",
        outcome: "empty",
        detail: "AudD returned null / no title+artist",
      });
    } catch (error) {
      attempts.push({
        provider: "audd",
        outcome: "error",
        detail: error instanceof Error ? error.message : "unknown AudD error",
      });
      console.warn("[recognize] AudD failed — will try Shazam failover");
    }
    return null;
  };

  const tryShazam = async () => {
    try {
      const hit = await recognizeWithShazam(audio);
      if (hit) {
        attempts.push({ provider: "shazam", outcome: "match" });
        return hit;
      }
      attempts.push({
        provider: "shazam",
        outcome: "empty",
        detail: "Shazam returned null / no title+artist",
      });
    } catch (error) {
      attempts.push({
        provider: "shazam",
        outcome: "error",
        detail: error instanceof Error ? error.message : "unknown Shazam error",
      });
    }
    return null;
  };

  // Default path: AudD first, then automatic Shazam failover on error/empty/rate-limit.
  // ACTIVE_AUDIO_API=shazam skips straight to Shazam.
  if (primary === "shazam") {
    const hit = await tryShazam();
    return { hit, source: hit ? "shazam" : null, attempts };
  }

  const auddHit = await tryAudd();
  if (auddHit) return { hit: auddHit, source: "audd", attempts };

  const shazamHit = await tryShazam();
  return {
    hit: shazamHit,
    source: shazamHit ? "shazam" : null,
    attempts,
  };
}

function successPayload(
  song: SongResult,
  source: "audd" | "shazam",
): RecognizeResponse {
  return {
    success: true,
    ok: true,
    status: "EXACT_MATCH",
    searchMode: "quick",
    source,
    song,
    songs: [song],
    confidence: song.matchPercent ?? 92,
  };
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
    const audioField =
      formData.get("audio") ?? formData.get("file") ?? formData.get("upload_file");
    const hasAudio = audioField instanceof Blob && audioField.size > 0;

    if (hasTextClues(clues)) {
      const songs = await runTextPowerSearch(clues);
      if (songs.length === 0) {
        return returnNoMatch("Power Search text clues produced zero songs", {
          clues,
        });
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
      return returnNoMatch("No audio blob in FormData", {
        audioType: typeof audioField,
        audioSize: audioField instanceof Blob ? audioField.size : 0,
        clues,
      });
    }

    const file = audioField;
    console.log("Received audio size:", file.size);
    console.log("[recognize] Audio blob received", {
      size: file.size,
      type: file.type || "unknown",
      name: file instanceof File ? file.name : "blob",
      activeApi: getActiveAudioApi(),
    });

    if (file.size < 2000) {
      console.error(
        "[recognize] Audio size is very low — mic may be capturing silence",
        { size: file.size },
      );
    }

    const recognized = await recognizeAudioWithFailover(file);
    if (!recognized.hit || !recognized.source) {
      return returnNoMatch("AudD and/or Shazam produced no match", {
        providerAttempts: recognized.attempts,
        audioBytes: file.size,
        audioType: file.type || "unknown",
      });
    }

    const song = await enrichSongWithItunes(recognized.hit);
    if (!song.title?.trim() || !song.artist?.trim()) {
      return returnNoMatch("Enrichment produced empty title/artist", {
        hit: recognized.hit,
        source: recognized.source,
      });
    }

    return NextResponse.json(successPayload(song, recognized.source));
  } catch (error) {
    return returnNoMatch("Unexpected recognize route exception", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
