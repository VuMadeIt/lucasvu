"use client";

import { useCallback, useRef, useState } from "react";

type UseAudioRecorderReturn = {
  audioBlob: Blob | null;
  audioVolume: number;
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
  const [audioVolume, setAudioVolume] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopPromiseRef = useRef<{
    resolve: (blob: Blob | null) => void;
  } | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothedVolumeRef = useRef(0);

  const stopVolumeMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    try {
      sourceRef.current?.disconnect();
    } catch {
      /* already disconnected */
    }
    sourceRef.current = null;
    analyserRef.current = null;

    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close();
    }

    smoothedVolumeRef.current = 0;
    setAudioVolume(0);
  }, []);

  const startVolumeMeter = useCallback(
    (stream: MediaStream) => {
      stopVolumeMeter();

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      const data = new Uint8Array(analyser.fftSize);

      const tick = () => {
        const node = analyserRef.current;
        if (!node) return;

        node.getByteTimeDomainData(data);

        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const centered = (data[i] - 128) / 128;
          sum += centered * centered;
        }

        const rms = Math.sqrt(sum / data.length);
        // Boost quiet humming into a usable 0–1 range for the wave.
        const boosted = Math.min(1, rms * 4.2);
        smoothedVolumeRef.current =
          smoothedVolumeRef.current * 0.72 + boosted * 0.28;
        setAudioVolume(smoothedVolumeRef.current);

        rafRef.current = requestAnimationFrame(tick);
      };

      void ctx.resume();
      rafRef.current = requestAnimationFrame(tick);
    },
    [stopVolumeMeter],
  );

  const cleanupStream = useCallback(() => {
    stopVolumeMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, [stopVolumeMeter]);

  const startRecording = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone access is not supported in this browser.");
      throw new Error("getUserMedia unavailable");
    }

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    cleanupStream();

    setError(null);
    setAudioBlob(null);
    setAudioVolume(0);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      startVolumeMeter(stream);

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

      // Timeslice so an early "I'm done here" stop still has captured chunks.
      recorder.start(250);
      setIsRecording(true);
    } catch (err) {
      cleanupStream();
      setIsRecording(false);
      const message =
        err instanceof Error ? err.message : "Unable to access the microphone.";
      setError(message);
      throw err;
    }
  }, [cleanupStream, startVolumeMeter]);

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
        // Flush any buffered audio up to this exact moment before stopping.
        if (recorder.state === "recording") {
          try {
            recorder.requestData();
          } catch {
            /* requestData unsupported — timeslice chunks still apply */
          }
        }
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
    audioVolume,
    isRecording,
    error,
    startRecording,
    stopRecording,
  };
}
