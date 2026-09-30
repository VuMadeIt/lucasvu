import { NextResponse } from "next/server";
import { enrichWithItunes } from "@/lib/enrichWithItunes";
import { guessSongsWithLlm } from "@/lib/llmSongGuess";
import type {
  PowerSearchClues,
  PowerSearchResponse,
} from "@/lib/powerSearchTypes";

export const runtime = "nodejs";

function failure(error: string, message: string, status = 400) {
  const body: PowerSearchResponse = { ok: false, error, message };
  return NextResponse.json(body, { status });
}

function parseClues(body: unknown): PowerSearchClues | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as Record<string, unknown>;

  return {
    lyrics: String(payload.lyrics ?? ""),
    songSection: String(payload.songSection ?? "any"),
    genre: String(payload.genre ?? "any"),
    era: String(payload.era ?? "any"),
  };
}

export async function POST(request: Request) {
  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return failure("INVALID_JSON", "Request body must be valid JSON.");
    }

    const clues = parseClues(json);
    if (!clues) {
      return failure("INVALID_PAYLOAD", "Expected lyrics, songSection, genre, and era.");
    }

    const hasAnyClue = [clues.lyrics, clues.songSection, clues.genre, clues.era].some(
      (value) => value.trim() && !/^any(\s|$)/i.test(value.trim()),
    );

    if (!hasAnyClue && !clues.lyrics.trim()) {
      return failure(
        "EMPTY_CLUES",
        "Add at least one clue (lyrics, section, genre, or era) before searching.",
      );
    }

    const guesses = await guessSongsWithLlm(clues);
    if (guesses.length === 0) {
      return failure(
        "NO_MATCH",
        "The model could not identify likely songs from those clues.",
        404,
      );
    }

    const results = await enrichWithItunes(guesses);
    const body: PowerSearchResponse = { ok: true, results };
    return NextResponse.json(body);
  } catch (error) {
    console.error("[power-search] Failed", error);
    const message =
      error instanceof Error
        ? error.message
        : "Power search failed unexpectedly.";
    return failure("POWER_SEARCH_FAILED", message, 502);
  }
}
