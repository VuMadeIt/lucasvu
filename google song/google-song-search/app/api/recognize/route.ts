import { NextResponse } from "next/server";
import { recognizeWithAcrCloud } from "@/lib/acrcloud";
import { recognizeWithAudd } from "@/lib/audd";
import {
  EXACT_MATCH_CONFIDENCE,
  LowConfidenceError,
  recognizeWithShazam,
} from "@/lib/shazam";
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

type ExactHit = {
  song: SongResult;
  confidence: number;
  source: "shazam" | "audd";
};

/**
 * Pass 1 — exact fingerprint match via Shazam, then AudD if configured.
 * Only returns a hit when confidence clears the 75% gate.
 */
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

/**
 * Pass 2 — humming / pitch-contour via ACRCloud (optional).
 */
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

    const audio = formData.get("audio");
    const hasAudio = audio instanceof Blob && audio.size > 0;

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

    // Both passes failed → hand off to Power Search on the client
    return NextResponse.json(noMatchPayload());
  } catch (error) {
    console.error("[recognize] Unexpected error", error);
    // Never surface an uncaught 500 — return structured Power Search handoff.
    return NextResponse.json(noMatchPayload());
  }
}
