import { NextResponse } from "next/server";
import { recognizeWithShazam } from "@/lib/shazam";
import { searchByText } from "@/lib/searchByText";
import type { RecognizeResponse } from "@/lib/types";

export const runtime = "nodejs";

function failure(reason: string, status = 200) {
  const body: RecognizeResponse = { ok: false, reason };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    const lyrics = String(formData.get("lyrics") ?? "");
    const genre = String(formData.get("genre") ?? "");
    const era = String(formData.get("era") ?? "");

    const hasAudio = audio instanceof Blob && audio.size > 0;

    // Prefer Shazam when we have audio; fall back to iTunes text search.
    if (hasAudio) {
      try {
        const song = await recognizeWithShazam(audio);
        const body: RecognizeResponse = {
          ok: true,
          source: "shazam",
          songs: [song],
        };
        return NextResponse.json(body);
      } catch (error) {
        console.warn("[recognize] Shazam miss/fail — falling back to iTunes", error);
      }
    }

    try {
      const songs = await searchByText(lyrics, genre, era);
      if (songs.length === 0) {
        return failure(
          "Couldn't identify that tune. Try again with more clues.",
        );
      }

      const body: RecognizeResponse = {
        ok: true,
        source: "itunes",
        songs,
      };
      return NextResponse.json(body);
    } catch (error) {
      console.error("[recognize] iTunes fallback failed", error);
      return failure("Search failed. Please try again.", 502);
    }
  } catch (error) {
    console.error("[recognize] Unexpected error", error);
    return failure("Something went wrong while recognizing the audio.", 500);
  }
}
