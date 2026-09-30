import "server-only";

/**
 * Server-only secret accessors. Never import this file from client components.
 * Values stay in process.env (.env.local) and are never sent to the browser.
 */

export function getAuddApiKey(): string {
  return (
    process.env.AUDD_API_KEY?.trim() ||
    process.env.AUDD_API_TOKEN?.trim() ||
    ""
  );
}

export function getRapidApiKey(): string {
  return process.env.RAPIDAPI_KEY?.trim() || "";
}

export function getRapidApiHost(): string {
  return process.env.RAPIDAPI_HOST?.trim() || "shazam-api6.p.rapidapi.com";
}

export function getActiveAudioApi(): "audd" | "shazam" {
  const raw = (process.env.ACTIVE_AUDIO_API ?? "audd").trim().toLowerCase();
  return raw === "shazam" ? "shazam" : "audd";
}

/** Safe for logs / client — never includes tokens or response bodies. */
export function safeProviderError(
  provider: string,
  status?: number,
  kind: "http" | "auth" | "parse" | "config" | "unknown" = "unknown",
): Error {
  const suffix = status ? ` (${status})` : "";
  return new Error(`${provider} ${kind} failure${suffix}`);
}
