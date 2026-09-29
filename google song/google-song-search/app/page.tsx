"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mic, X } from "lucide-react";

type SearchMode = "quick" | "power";
type AppState = "idle" | "listening" | "analyzing" | "result" | "failed";

const GOOGLE_ORB_COLORS = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"] as const;

function GoogleListeningAnimation() {
  return (
    <div className="flex flex-col items-center gap-10">
      <div className="relative flex h-28 w-28 items-center justify-center">
        {/* Soft glowing pulse behind the orbs */}
        <motion.div
          aria-hidden
          className="absolute h-24 w-24 rounded-full bg-[#ffffff20] blur-2xl"
          animate={{ scale: [1, 1.3, 1] }}
          transition={{
            duration: 2.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Four Google-colored equalizer orbs */}
        <div className="relative z-10 flex items-center gap-3">
          {GOOGLE_ORB_COLORS.map((color, index) => (
            <motion.span
              key={color}
              className="block h-3.5 w-3.5 rounded-full"
              style={{
                backgroundColor: color,
                boxShadow: `0 0 12px ${color}aa, 0 0 24px ${color}55`,
              }}
              animate={{ scaleY: [1, 2.6, 1], scaleX: [1, 0.85, 1] }}
              transition={{
                duration: 0.9,
                repeat: Infinity,
                repeatType: "mirror",
                ease: "easeInOut",
                delay: index * 0.12,
              }}
            />
          ))}
        </div>
      </div>

      <motion.p
        className="text-lg font-normal tracking-tight text-white/90"
        animate={{ opacity: [0.45, 1, 0.45] }}
        transition={{
          duration: 1.8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        Listening...
      </motion.p>
    </div>
  );
}

export default function Home() {
  const [searchMode, setSearchMode] = useState<SearchMode>("quick");
  const [appState, setAppState] = useState<AppState>("idle");

  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <div
        data-search-mode={searchMode}
        data-app-state={appState}
        className="relative mx-auto h-screen w-full max-w-md overflow-hidden bg-[#1b1b1b] text-white"
      >
        <header className="absolute inset-x-0 top-0 z-10 flex items-center px-4 pt-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setAppState("idle")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10"
          >
            <X className="h-6 w-6" strokeWidth={1.75} />
          </button>
        </header>

        {appState === "idle" && (
          <>
            <main className="flex h-full flex-col items-center justify-center px-8 pb-28">
              <h1 className="max-w-[280px] text-center text-[1.75rem] font-normal leading-snug tracking-tight text-white sm:text-[2rem]">
                Play, sing, or hum a song
              </h1>
            </main>

            <div className="absolute inset-x-0 bottom-0 flex justify-center pb-12">
              <button
                type="button"
                aria-label="Start listening"
                onClick={() => setAppState("listening")}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#1b1b1b] shadow-lg transition-transform active:scale-95"
              >
                <Mic className="h-7 w-7" strokeWidth={2} />
              </button>
            </div>
          </>
        )}

        {appState === "listening" && (
          <main className="flex h-full flex-col items-center justify-center px-8">
            <GoogleListeningAnimation />
          </main>
        )}
      </div>
    </div>
  );
}
