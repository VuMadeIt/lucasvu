"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, History, Mic } from "lucide-react";

type SearchMode = "quick" | "power";
type AppState = "idle" | "listening" | "analyzing" | "result" | "failed";

const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"] as const;
const STAGE_1_TIMEOUT_MS = 8000;

const GENRE_OPTIONS = [
  "Any genre",
  "Pop",
  "Hip-hop",
  "R&B",
  "Rock",
  "Indie",
  "Electronic",
  "Country",
  "Jazz",
  "Classical",
] as const;

const ERA_OPTIONS = [
  "Any era",
  "2020s",
  "2010s",
  "2000s",
  "1990s",
  "1980s",
  "1970s",
  "Older",
] as const;

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

function BottomColorWave() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-40 overflow-visible">
      <motion.div
        aria-hidden
        className="absolute bottom-0 left-1/2 h-40 w-[140%] -translate-x-1/2 rounded-t-[100%] blur-[80px]"
        style={{ originY: 1 }}
        animate={{
          backgroundColor: [...GOOGLE_COLORS, GOOGLE_COLORS[0]],
          scaleY: [1, 1.3, 1],
        }}
        transition={{
          backgroundColor: {
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          },
          scaleY: {
            duration: 2.2,
            repeat: Infinity,
            ease: "easeInOut",
          },
        }}
      />
    </div>
  );
}

function PowerSearchFilters({
  genre,
  lyrics,
  era,
  onGenreChange,
  onLyricsChange,
  onEraChange,
}: {
  genre: string;
  lyrics: string;
  era: string;
  onGenreChange: (value: string) => void;
  onLyricsChange: (value: string) => void;
  onEraChange: (value: string) => void;
}) {
  const fieldClass =
    "w-full rounded-2xl bg-[#f1f3f4] px-4 py-3.5 text-sm text-black outline-none ring-0 placeholder:text-black/40 focus:bg-[#e8eaed]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex w-full max-w-sm flex-col gap-3"
    >
      <label className="block">
        <span className="mb-1.5 block px-1 text-xs font-medium text-black/55">
          Genre
        </span>
        <select
          value={genre}
          onChange={(e) => onGenreChange(e.target.value)}
          className={`${fieldClass} appearance-none`}
        >
          {GENRE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block px-1 text-xs font-medium text-black/55">
          Lyrics
        </span>
        <input
          type="text"
          value={lyrics}
          onChange={(e) => onLyricsChange(e.target.value)}
          placeholder="Any words you remember"
          className={fieldClass}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block px-1 text-xs font-medium text-black/55">
          Era
        </span>
        <select
          value={era}
          onChange={(e) => onEraChange(e.target.value)}
          className={`${fieldClass} appearance-none`}
        >
          {ERA_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </motion.div>
  );
}

export default function Home() {
  const [searchMode, setSearchMode] = useState<SearchMode>("quick");
  const [appState, setAppState] = useState<AppState>("idle");
  const [genre, setGenre] = useState<string>(GENRE_OPTIONS[0]);
  const [lyrics, setLyrics] = useState("");
  const [era, setEra] = useState<string>(ERA_OPTIONS[0]);

  const resetSession = () => {
    setAppState("idle");
    setSearchMode("quick");
    setGenre(GENRE_OPTIONS[0]);
    setLyrics("");
    setEra(ERA_OPTIONS[0]);
  };

  const startListening = () => {
    setSearchMode("quick");
    setAppState("listening");
  };

  const stopSearch = () => {
    setAppState("analyzing");
  };

  // Stage 1: after 8s without a match, fall back to Power Search
  useEffect(() => {
    if (appState !== "listening" || searchMode !== "quick") return;

    const timer = window.setTimeout(() => {
      setSearchMode("power");
    }, STAGE_1_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [appState, searchMode]);

  const isListening = appState === "listening";
  const isPower = searchMode === "power" && isListening;

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
            onClick={resetSession}
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
            <main className="relative z-10 flex h-full flex-col items-center px-6 pt-[16vh]">
              <div className="relative mb-8 flex min-h-[11rem] w-full items-start justify-center">
                <AnimatePresence mode="wait">
                  {!isPower ? (
                    <motion.h1
                      key="hero"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.4 }}
                      className="absolute text-center text-6xl font-bold leading-none tracking-tight text-black sm:text-7xl"
                    >
                      <span className="block">Play</span>
                      <span className="block">Sing</span>
                      <span className="block">Hum</span>
                    </motion.h1>
                  ) : (
                    <motion.p
                      key="power-copy"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="absolute max-w-xs text-center text-2xl font-medium leading-snug tracking-tight text-black"
                    >
                      Humming was tricky? Add clues.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              <AnimatePresence>
                {isPower && (
                  <PowerSearchFilters
                    genre={genre}
                    lyrics={lyrics}
                    era={era}
                    onGenreChange={setGenre}
                    onLyricsChange={setLyrics}
                    onEraChange={setEra}
                  />
                )}
              </AnimatePresence>

              {!isPower && (
                <motion.p
                  className="mt-4 text-lg font-normal tracking-tight text-black/70"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  Listening...
                </motion.p>
              )}
            </main>

            <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-6 pb-10">
              {isPower && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={stopSearch}
                  className="rounded-full bg-[#1a73e8] px-8 py-3.5 text-sm font-medium text-white shadow-md transition-transform active:scale-95"
                >
                  Stop Search
                </motion.button>
              )}
            </div>

            <BottomColorWave />
          </>
        )}

        {appState === "analyzing" && (
          <>
            <main className="relative z-10 flex h-full flex-col items-center justify-center px-8">
              <motion.p
                className="text-lg font-medium text-black/80"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                Analyzing...
              </motion.p>
            </main>
            <BottomColorWave />
          </>
        )}
      </div>
    </div>
  );
}
