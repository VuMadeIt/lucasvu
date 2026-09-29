import { NextResponse } from "next/server";
import {
  LowConfidenceError,
  recognizeWithShazam,
} from "@/lib/shazam";
import { searchByText } from "@/lib/searchByText";
import type { RecognizeFailure, RecognizeResponse } from "@/lib/types";

export const runtime = "nodejs";

const LOW_CONFIDENCE_MESSAGE = "Could not confidently identify audio";

function failure(
  error: RecognizeFailure["error"],
  message: string,
  status = 200,
) {
  const body: RecognizeFailure = {
    success: false,
    ok: false,
    error,
    message,
    reason: message,
  };
  return NextResponse.json(body, { status });
}

function hasUsefulFilters(lyrics: string, genre: string, era: string) {
  const meaningful = [lyrics, genre, era].filter(
    (value) => value.trim() && !/^any\s/i.test(value.trim()),
  );
  return meaningful.length > 0;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    const lyrics = String(formData.get("lyrics") ?? "");
    const genre = String(formData.get("genre") ?? "");
    const era = String(formData.get("era") ?? "");

    const hasAudio = audio instanceof Blob && audio.size > 0;
    const canFallbackToText = hasUsefulFilters(lyrics, genre, era);

    // Prefer Shazam when we have audio; reject low-confidence / wrong matches.
    if (hasAudio) {
      try {
        const { song, confidence } = await recognizeWithShazam(audio);
        const body: RecognizeResponse = {
          success: true,
          ok: true,
          source: "shazam",
          songs: [song],
          confidence,
        };
        return NextResponse.json(body);
      } catch (error) {
        const isLowConfidence = error instanceof LowConfidenceError;
        console.warn(
          `[recognize] Shazam ${isLowConfidence ? "low-confidence" : "miss/fail"}`,
          error,
        );

        // Without text clues, never invent a song — surface LOW_CONFIDENCE.
        if (!canFallbackToText) {
          return failure("LOW_CONFIDENCE", LOW_CONFIDENCE_MESSAGE);
        }
      }
    }

    if (!canFallbackToText) {
      return failure("LOW_CONFIDENCE", LOW_CONFIDENCE_MESSAGE);
    }

    try {
      const songs = await searchByText(lyrics, genre, era);
      if (songs.length === 0) {
        return failure(
          "NO_MATCH",
          "Couldn't identify that tune. Try again with more clues.",
        );
      }

      const body: RecognizeResponse = {
        success: true,
        ok: true,
        source: "itunes",
        songs,
      };
      return NextResponse.json(body);
    } catch (error) {
      console.error("[recognize] iTunes fallback failed", error);
      return failure("SEARCH_FAILED", "Search failed. Please try again.", 502);
    }
  } catch (error) {
    console.error("[recognize] Unexpected error", error);
    return failure(
      "SERVER_ERROR",
      "Something went wrong while recognizing the audio.",
      500,
    );
  }
}
