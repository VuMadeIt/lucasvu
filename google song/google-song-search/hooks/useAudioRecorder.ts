"use client";

import { useCallback, useRef, useState } from "react";

type UseAudioRecorderReturn = {
  audioBlob: Blob | null;
  isRecording: boolean;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
};

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopPromiseRef = useRef<{
    resolve: (blob: Blob | null) => void;
  } | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone access is not supported in this browser.");
      throw new Error("getUserMedia unavailable");
    }

    // Stop any in-flight recording cleanly
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    cleanupStream();

    setError(null);
    setAudioBlob(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, { type })
            : null;

        setAudioBlob(blob);
        setIsRecording(false);
        cleanupStream();
        mediaRecorderRef.current = null;

        stopPromiseRef.current?.resolve(blob);
        stopPromiseRef.current = null;
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      cleanupStream();
      setIsRecording(false);
      const message =
        err instanceof Error ? err.message : "Unable to access the microphone.";
      setError(message);
      throw err;
    }
  }, [cleanupStream]);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      cleanupStream();
      setIsRecording(false);
      return audioBlob;
    }

    return new Promise<Blob | null>((resolve) => {
      stopPromiseRef.current = { resolve };
      try {
        recorder.stop();
      } catch {
        cleanupStream();
        setIsRecording(false);
        stopPromiseRef.current = null;
        resolve(null);
      }
    });
  }, [audioBlob, cleanupStream]);

  return {
    audioBlob,
    isRecording,
    error,
    startRecording,
    stopRecording,
  };
}
