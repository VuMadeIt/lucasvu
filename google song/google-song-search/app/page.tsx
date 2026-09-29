"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useSpring, useTransform } from "framer-motion";
import {
  ChevronLeft,
  FileAudio,
  History,
  Loader2,
  Mic,
  RefreshCw,
} from "lucide-react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { analyzeAudio } from "@/lib/analyzeAudio";

type SearchMode = "quick" | "power";
type AppState = "idle" | "listening" | "analyzing" | "failed";

const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"] as const;
const STAGE_1_TIMEOUT_MS = 8000;

type ListeningPrompt =
  | { key: "hero"; kind: "stacked" }
  | { key: "listening" | "keep-going" | "almost"; kind: "line"; text: string };

function getListeningPrompt(elapsedMs: number): ListeningPrompt {
  if (elapsedMs < 2000) return { key: "hero", kind: "stacked" };
  if (elapsedMs < 4000) {
    return { key: "listening", kind: "line", text: "Listening..." };
  }
  if (elapsedMs < 6000) {
    return { key: "keep-going", kind: "line", text: "Keep going..." };
  }
  return { key: "almost", kind: "line", text: "Almost there..." };
}

function GoogleGLogo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-label="Google"
      role="img"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function ReactiveBottomWave({ audioVolume }: { audioVolume: number }) {
  const volumeSpring = useSpring(audioVolume, {
    stiffness: 280,
    damping: 26,
    mass: 0.45,
  });

  useEffect(() => {
    volumeSpring.set(audioVolume);
  }, [audioVolume, volumeSpring]);

  const scaleY = useTransform(volumeSpring, [0, 1], [0.28, 1.55]);
  const translateY = useTransform(volumeSpring, [0, 1], [28, -8]);

  return (
    <div className="pointer-events-none absolute bottom-0 z-0 h-32 w-full overflow-hidden">
      <motion.div
        aria-hidden
        className="absolute bottom-0 left-0 h-full w-[120%] -ml-[10%] rounded-t-[100%]"
        style={{
          originY: 1,
          scaleY,
          y: translateY,
          filter: "blur(28px)",
        }}
        animate={{
          backgroundColor: [...GOOGLE_COLORS, GOOGLE_COLORS[0]],
        }}
        transition={{
          backgroundColor: {
            duration: 5.5,
            repeat: Infinity,
            ease: "easeInOut",
          },
        }}
      />
    </div>
  );
}

function AnalyzingLoader() {
  return (
    <div className="flex flex-col items-center gap-4">
      <Loader2
        className="h-10 w-10 animate-spin text-[#1a73e8]"
        strokeWidth={2}
        aria-hidden
      />
      <p className="text-lg font-medium text-black/80">Analyzing...</p>
    </div>
  );
}

function ListeningHeadline({ elapsedMs }: { elapsedMs: number }) {
  const prompt = getListeningPrompt(elapsedMs);

  return (
    <div className="relative flex min-h-[11rem] w-full items-center justify-center">
      <AnimatePresence mode="wait">
        {prompt.kind === "stacked" ? (
          <motion.h1
            key={prompt.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute text-center text-6xl font-bold leading-none tracking-tight text-black sm:text-7xl"
          >
            <span className="block">Play</span>
            <span className="block">Sing</span>
            <span className="block">Hum</span>
          </motion.h1>
        ) : (
          <motion.p
            key={prompt.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute text-center text-3xl font-medium tracking-tight text-black sm:text-4xl"
          >
            {prompt.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Home() {
  const [searchMode, setSearchMode] = useState<SearchMode>("quick");
  const [appState, setAppState] = useState<AppState>("idle");
  const [listeningElapsedMs, setListeningElapsedMs] = useState(0);

  const {
    startRecording,
    stopRecording,
    audioVolume,
    error: micError,
  } = useAudioRecorder();

  const analyzingRef = useRef(false);
  const listeningStartedAtRef = useRef<number | null>(null);

  const resetSession = useCallback(async () => {
    analyzingRef.current = false;
    listeningStartedAtRef.current = null;
    await stopRecording();
    setListeningElapsedMs(0);
    setAppState("idle");
    setSearchMode("quick");
  }, [stopRecording]);

  const startListening = () => {
    setSearchMode("quick");
    setListeningElapsedMs(0);
    listeningStartedAtRef.current = Date.now();
    setAppState("listening");
  };

  const redirectToGoogle = (title: string, artist: string) => {
    const query = encodeURIComponent(`${title} ${artist}`);
    window.location.href = `https://www.google.com/search?q=${query}`;
  };

  const runAnalysis = useCallback(async () => {
    if (analyzingRef.current) return;
    analyzingRef.current = true;

    const blob = await stopRecording();
    setAppState("analyzing");
    listeningStartedAtRef.current = null;

    const result = await analyzeAudio(blob);

    if (result.success && result.ok && result.songs.length > 0) {
      const song = result.songs[0];
      redirectToGoogle(song.title, song.artist);
      return;
    }

    setAppState("failed");
    analyzingRef.current = false;
  }, [stopRecording]);

  // Start mic whenever we enter listening
  useEffect(() => {
    if (appState !== "listening") return;

    let cancelled = false;
    listeningStartedAtRef.current = Date.now();
    setListeningElapsedMs(0);

    (async () => {
      try {
        await startRecording();
      } catch {
        if (!cancelled) {
          setAppState("idle");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appState, startRecording]);

  // Drive sequential listening copy from recording elapsed time
  useEffect(() => {
    if (appState !== "listening") return;

    const tick = () => {
      const startedAt = listeningStartedAtRef.current ?? Date.now();
      setListeningElapsedMs(Date.now() - startedAt);
    };

    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [appState]);

  // Stage 1: auto-stop after 8s in quick mode → analyze
  useEffect(() => {
    if (appState !== "listening" || searchMode !== "quick") return;

    const timer = window.setTimeout(() => {
      void runAnalysis();
    }, STAGE_1_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [appState, searchMode, runAnalysis]);

  const isListening = appState === "listening";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#e8eaed]">
      <div
        data-search-mode={searchMode}
        data-app-state={appState}
        className="relative mx-auto h-screen w-full max-w-md overflow-hidden bg-white text-black"
      >
        <header className="absolute inset-x-0 top-0 z-20 grid grid-cols-3 items-center px-3 pt-3">
          <button
            type="button"
            aria-label="Back"
            onClick={() => {
              void resetSession();
            }}
            className="flex h-10 w-10 items-center justify-center justify-self-start rounded-full text-black/80 transition-colors hover:bg-black/5"
          >
            <ChevronLeft className="h-7 w-7" strokeWidth={1.75} />
          </button>

          <div className="flex justify-center">
            <GoogleGLogo className="h-7 w-7" />
          </div>

          <button
            type="button"
            aria-label="History"
            className="flex h-10 w-10 items-center justify-center justify-self-end rounded-full text-black/70 transition-colors hover:bg-black/5"
          >
            <History className="h-6 w-6" strokeWidth={1.75} />
          </button>
        </header>

        {appState === "idle" && (
          <>
            <main className="relative z-10 flex h-full flex-col items-center px-8 pt-[22vh]">
              <h1 className="text-center text-6xl font-bold leading-none tracking-tight text-black sm:text-7xl">
                <span className="block">Play</span>
                <span className="block">Sing</span>
                <span className="block">Hum</span>
              </h1>
              {micError && (
                <p className="mt-6 max-w-xs text-center text-sm text-red-600">
                  {micError}
                </p>
              )}
            </main>

            <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pb-12">
              <button
                type="button"
                aria-label="Start listening"
                onClick={startListening}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1a73e8] text-white shadow-lg transition-transform active:scale-95"
              >
                <Mic className="h-7 w-7" strokeWidth={2} />
              </button>
            </div>
          </>
        )}

        {isListening && (
          <>
            <main className="relative z-10 flex h-full flex-col items-center px-6 pt-[18vh]">
              <ListeningHeadline elapsedMs={listeningElapsedMs} />
            </main>
            <ReactiveBottomWave audioVolume={audioVolume} />
          </>
        )}

        {appState === "analyzing" && (
          <main className="relative z-10 flex h-full flex-col items-center justify-center px-8">
            <AnalyzingLoader />
          </main>
        )}

        {appState === "failed" && (
          <main className="relative z-10 flex h-full flex-col items-center justify-center px-8 text-center">
            <div className="mb-8 flex h-28 w-28 items-center justify-center rounded-3xl bg-[#f1f3f4]">
              <FileAudio
                className="h-14 w-14 text-black/35"
                strokeWidth={1.5}
                aria-hidden
              />
            </div>
            <p className="text-lg font-medium text-black/55">No matched song</p>
            <button
              type="button"
              onClick={() => {
                void resetSession();
              }}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#f1f3f4] px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-[#e8eaed]"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={2} />
              Try again
            </button>
          </main>
        )}
      </div>
    </div>
  );
}
