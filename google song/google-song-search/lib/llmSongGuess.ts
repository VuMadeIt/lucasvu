import type { LlmSongGuess, PowerSearchClues } from "@/lib/powerSearchTypes";

const SECTION_LABELS: Record<string, string> = {
  any: "Not sure",
  chorus: "Chorus / Hook",
  verse: "Verse",
  bridge: "Bridge",
  intro: "Intro / Outro",
};

function buildPrompt(clues: PowerSearchClues): string {
  const section =
    SECTION_LABELS[clues.songSection] ??
    (clues.songSection.trim() || "Not sure");
  const genre =
    !clues.genre || /^any/i.test(clues.genre) ? "Not specified" : clues.genre;
  const era =
    !clues.era || /^any/i.test(clues.era) ? "Not specified" : clues.era;
  const lyrics = clues.lyrics.trim() || "(none provided)";

  return `You are an elite music historian and song identification expert. A user is trying to find a song with the following vague clues:

Lyric fragment: "${lyrics}"
Song section: "${section}" (e.g. Chorus, Verse, Bridge)
Genre: "${genre}"
Era/Decade: "${era}"

Account for misheard lyrics, phonetic similarity, and song context. Identify the 5 most likely matching real-world songs.

Return ONLY valid JSON matching this shape:
{
  "results": [
    {
      "title": "Song Title",
      "artist": "Artist Name",
      "matchPercentage": 92,
      "reasoning": "Brief explanation of why this matches the lyric/genre clue"
    }
  ]
}

Rules:
- Exactly 5 results, ranked most-likely first.
- matchPercentage must be an integer from 1 to 99, descending.
- Prefer real, identifiable commercially released songs.
- reasoning must be one short sentence.`;
}

function normalizeResults(raw: unknown): LlmSongGuess[] {
  const payload = raw as { results?: unknown };
  if (!Array.isArray(payload?.results)) return [];

  return payload.results
    .map((item) => {
      const row = item as Partial<LlmSongGuess>;
      const title = String(row.title ?? "").trim();
      const artist = String(row.artist ?? "").trim();
      if (!title || !artist) return null;

      const pct = Number(row.matchPercentage);
      return {
        title,
        artist,
        matchPercentage: Number.isFinite(pct)
          ? Math.max(1, Math.min(99, Math.round(pct)))
          : 50,
        reasoning: String(row.reasoning ?? "").trim() || "Likely match from clues.",
      };
    })
    .filter((item): item is LlmSongGuess => item !== null)
    .slice(0, 5);
}

async function callGemini(clues: PowerSearchClues): Promise<LlmSongGuess[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(clues) }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            results: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  artist: { type: "STRING" },
                  matchPercentage: { type: "INTEGER" },
                  reasoning: { type: "STRING" },
                },
                required: ["title", "artist", "matchPercentage", "reasoning"],
              },
            },
          },
          required: ["results"],
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Gemini request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response.");

  return normalizeResults(JSON.parse(text));
}

async function callOpenAI(clues: PowerSearchClues): Promise<LlmSongGuess[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You identify songs from vague humming/lyric clues. Always reply with strict JSON only.",
        },
        { role: "user", content: buildPrompt(clues) },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI request failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI returned an empty response.");

  return normalizeResults(JSON.parse(text));
}

/**
 * Prefer Gemini when configured; otherwise OpenAI.
 */
export async function guessSongsWithLlm(
  clues: PowerSearchClues,
): Promise<LlmSongGuess[]> {
  if (process.env.GEMINI_API_KEY) {
    return callGemini(clues);
  }
  if (process.env.OPENAI_API_KEY) {
    return callOpenAI(clues);
  }
  throw new Error(
    "No LLM API key configured. Set GEMINI_API_KEY or OPENAI_API_KEY in .env.local.",
  );
}
