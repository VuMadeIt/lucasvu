/**
 * Normalize a recorded Blob into a named File with a clear extension.
 * Upstream APIs (AudD / Shazam) often discard anonymous blobs without filenames.
 */
export function toNamedAudioFile(
  audio: Blob,
  fallbackName = "recording.webm",
): File {
  const rawType = (audio.type || "audio/webm").toLowerCase();
  const baseType = rawType.split(";")[0]?.trim() || "audio/webm";

  const extension = baseType.includes("ogg")
    ? "ogg"
    : baseType.includes("mp4") || baseType.includes("m4a")
      ? "m4a"
      : baseType.includes("mpeg") || baseType.includes("mp3")
        ? "mp3"
        : baseType.includes("wav")
          ? "wav"
          : "webm";

  const preferredType =
    extension === "webm"
      ? "audio/webm"
      : extension === "m4a"
        ? "audio/mp4"
        : baseType;

  const existingName = audio instanceof File ? audio.name : "";
  const name =
    existingName && /\.(webm|ogg|mp3|wav|m4a|mp4)$/i.test(existingName)
      ? existingName
      : fallbackName.endsWith(`.${extension}`)
        ? fallbackName
        : `recording.${extension}`;

  return new File([audio], name, { type: preferredType });
}
