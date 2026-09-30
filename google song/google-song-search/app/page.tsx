"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { AnimatePresence, motion, useSpring, useTransform } from "framer-motion";
import { ChevronLeft, History, Loader2, Mic, SearchX } from "lucide-react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { analyzeAudio, type SongResult } from "@/lib/analyzeAudio";
import { useMaterialWebReady } from "@/lib/materialWeb";

type SearchMode = "quick" | "power";
type AppState = "idle" | "listening" | "analyzing" | "result" | "hard-fail";

const GOOGLE_COLORS = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"] as const;
const STAGE_1_TIMEOUT_MS = 20_000;

const GENRE_OPTIONS = [
  { value: "any", label: "Any genre" },
  { value: "pop", label: "Pop" },
  { value: "hip-hop", label: "Hip-hop" },
  { value: "rnb", label: "R&B" },
  { value: "rock", label: "Rock" },
  { value: "indie", label: "Indie" },
  { value: "electronic", label: "Electronic" },
  { value: "country", label: "Country" },
  { value: "jazz", label: "Jazz" },
  { value: "classical", label: "Classical" },
] as const;

const ERA_OPTIONS = [
  { value: "any", label: "Any era" },
  { value: "2020s", label: "2020s" },
  { value: "2010s", label: "2010s" },
  { value: "2000s", label: "2000s" },
  { value: "1990s", label: "1990s" },
  { value: "1980s", label: "1980s" },
  { value: "1970s", label: "1970s" },
  { value: "older", label: "Older" },
] as const;

const SONG_SECTION_OPTIONS = [
  { value: "any", label: "Not sure" },
  { value: "chorus", label: "Chorus / Hook" },
  { value: "verse", label: "Verse" },
  { value: "bridge", label: "Bridge" },
  { value: "intro", label: "Intro / Outro" },
] as const;

type ListeningPrompt =
  | { key: "hero"; kind: "stacked" }
  | { key: "listening" | "keep-going" | "almost"; kind: "line"; text: string };

function getListeningPrompt(elapsedMs: number): ListeningPrompt {
  // 0–4s Play/Sing/Hum · 4–8s Listening · 8–14s Keep going · 14–20s Almost there
  if (elapsedMs < 4000) return { key: "hero", kind: "stacked" };
  if (elapsedMs < 8000) {
    return { key: "listening", kind: "line", text: "Listening..." };
  }
  if (elapsedMs < 14000) {
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

function YouTubeIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#FF0000"
        d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8z"
      />
      <path fill="#fff" d="M9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
    </svg>
  );
}

function SpotifyIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#1DB954" />
      <path
        fill="#fff"
        d="M16.9 10.5c-2.5-1.5-6.6-1.6-9-.9a.75.75 0 1 1-.4-1.45c2.8-.78 7.4-.63 10.4 1.15a.75.75 0 1 1-.8 1.27zm-.2 2.35a.62.62 0 0 1-.86.21c-2.1-1.29-5.3-1.66-7.78-.91a.63.63 0 0 1-.37-1.2c2.8-.85 6.3-.44 8.7 1.03.3.18.4.56.2.87zm-1 2.25a.5.5 0 0 1-.69.17c-1.83-1.12-4.14-1.37-6.86-.75a.5.5 0 1 1-.23-.97c2.98-.68 5.55-.39 7.6.86.24.15.32.46.18.69z"
      />
    </svg>
  );
}

function ReactiveBottomWave({ audioVolume }: { audioVolume: number }) {
  const volumeSpring = useSpring(audioVolume, {
    stiffness: 320,
    damping: 28,
    mass: 0.4,
  });

  useEffect(() => {
    volumeSpring.set(audioVolume);
  }, [audioVolume, volumeSpring]);

  // Quiet → flatter arc; loud → taller horizon spike from the bottom.
  const scaleY = useTransform(volumeSpring, [0, 1], [0.62, 1.45]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-56 overflow-hidden">
      {/* Horizon arc — sharp upward curve, color contained below the crest */}
      <motion.div
        aria-hidden
        className="absolute -bottom-[100px] left-1/2 h-[200px] w-[150%] -translate-x-1/2"
        style={{
          borderRadius: "50% 50% 0 0",
          originY: 1,
          scaleY,
          // Strongest at the crisp top edge, fades softly into white below.
          WebkitMaskImage:
            "linear-gradient(to bottom, #000 0%, #000 18%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, #000 0%, #000 18%, transparent 100%)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
        }}
        animate={{
          backgroundColor: [...GOOGLE_COLORS, GOOGLE_COLORS[0]],
        }}
        transition={{
          backgroundColor: {
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          },
          // scaleY is driven by the spring / useTransform binding
        }}
      />

      {/* Soft bloom just under the crest — keeps edge sharp, no full-block blur */}
      <motion.div
        aria-hidden
        className="absolute -bottom-[100px] left-1/2 h-[200px] w-[150%] -translate-x-1/2 opacity-50"
        style={{
          borderRadius: "50% 50% 0 0",
          originY: 1,
          scaleY,
          WebkitMaskImage:
            "linear-gradient(to bottom, #000 0%, transparent 42%)",
          maskImage: "linear-gradient(to bottom, #000 0%, transparent 42%)",
          filter: "blur(10px)",
        }}
        animate={{
          backgroundColor: [...GOOGLE_COLORS, GOOGLE_COLORS[0]],
        }}
        transition={{
          backgroundColor: {
            duration: 6,
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
    <div className="relative flex min-h-[12rem] w-full items-center justify-center">
      <AnimatePresence mode="wait">
        {prompt.kind === "stacked" ? (
          <motion.h1
            key={prompt.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute text-center font-medium text-[56px] leading-[1.15] tracking-tight text-[#1f1f1f]"
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
            className="absolute text-center font-medium text-[40px] leading-[1.15] tracking-tight text-[#1f1f1f]"
          >
            {prompt.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function PowerSearchFilters({
  genre,
  lyrics,
  era,
  songSection,
  onGenreChange,
  onLyricsChange,
  onEraChange,
  onSongSectionChange,
}: {
  genre: string;
  lyrics: string;
  era: string;
  songSection: string;
  onGenreChange: (value: string) => void;
  onLyricsChange: (value: string) => void;
  onEraChange: (value: string) => void;
  onSongSectionChange: (value: string) => void;
}) {
  const materialReady = useMaterialWebReady();
  const lyricsRef = useRef<HTMLElement | null>(null);
  const songSectionRef = useRef<HTMLElement | null>(null);
  const genreRef = useRef<HTMLElement | null>(null);
  const eraRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const field = lyricsRef.current;
    if (!field) return;

    const onInput = () => {
      const value = (field as HTMLInputElement & { value: string }).value ?? "";
      onLyricsChange(value);
    };

    field.addEventListener("input", onInput);
    return () => field.removeEventListener("input", onInput);
  }, [materialReady, onLyricsChange]);

  useEffect(() => {
    const select = songSectionRef.current;
    if (!select) return;

    const onChange = () => {
      const value = (select as HTMLSelectElement & { value: string }).value ?? "";
      onSongSectionChange(value);
    };

    select.addEventListener("change", onChange);
    return () => select.removeEventListener("change", onChange);
  }, [materialReady, onSongSectionChange]);

  useEffect(() => {
    const select = genreRef.current;
    if (!select) return;

    const onChange = () => {
      const value = (select as HTMLSelectElement & { value: string }).value ?? "";
      onGenreChange(value);
    };

    select.addEventListener("change", onChange);
    return () => select.removeEventListener("change", onChange);
  }, [materialReady, onGenreChange]);

  useEffect(() => {
    const select = eraRef.current;
    if (!select) return;

    const onChange = () => {
      const value = (select as HTMLSelectElement & { value: string }).value ?? "";
      onEraChange(value);
    };

    select.addEventListener("change", onChange);
    return () => select.removeEventListener("change", onChange);
  }, [materialReady, onEraChange]);

  if (!materialReady) {
    return (
      <div className="relative z-20 flex w-full max-w-sm flex-col gap-3 overflow-visible">
        <div className="h-14 w-full animate-pulse rounded-2xl bg-[#f1f3f4]" />
        <div className="h-14 w-full animate-pulse rounded-2xl bg-[#f1f3f4]" />
        <div className="h-14 w-full animate-pulse rounded-2xl bg-[#f1f3f4]" />
        <div className="h-14 w-full animate-pulse rounded-2xl bg-[#f1f3f4]" />
      </div>
    );
  }

  const materialFieldTheme = {
    "--md-sys-color-primary": "#1a73e8",
    "--md-sys-color-primary-container": "#e8f0fe",
    "--md-sys-color-on-primary-container": "#1967d2",
    "--md-filled-select-active-indicator-height": "0px",
    "--md-filled-select-focus-active-indicator-height": "0px",
    "--md-filled-select-active-indicator-color": "transparent",
    "--md-filled-select-focus-active-indicator-color": "transparent",
    "--md-filled-text-field-active-indicator-height": "0px",
    "--md-filled-text-field-focus-active-indicator-height": "0px",
    "--md-filled-text-field-active-indicator-color": "transparent",
    "--md-filled-text-field-focus-active-indicator-color": "transparent",
    "--md-filled-select-text-field-container-color": "#f1f3f4",
    "--md-filled-text-field-container-color": "#f1f3f4",
    "--md-menu-container-max-height": "140px",
  } as CSSProperties;

  const selectStyle = {
    ...materialFieldTheme,
    "--md-menu-container-max-height": "140px",
    "--md-filled-select-active-indicator-height": "0px",
    "--md-filled-select-focus-active-indicator-height": "0px",
    "--md-filled-select-active-indicator-color": "transparent",
    "--md-filled-select-focus-active-indicator-color": "transparent",
    "--md-sys-color-primary": "#1a73e8",
  } as CSSProperties;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative z-20 flex w-full max-w-sm flex-col gap-3 overflow-visible text-left"
      style={materialFieldTheme}
    >
      <md-filled-text-field
        ref={lyricsRef as never}
        label="Remember any lyrics?"
        placeholder="e.g. never gonna give you up"
        value={lyrics}
        className="w-full"
        style={materialFieldTheme}
      />

      <md-filled-select
        ref={songSectionRef as never}
        label="Part of the song"
        value={songSection}
        menu-positioning="fixed"
        anchor-corner="END_START"
        menu-corner="START_START"
        className="mt-4 w-full [&_::part(menu)]:!max-h-[140px] [&_::part(menu)]:overflow-y-auto"
        style={selectStyle}
      >
        {SONG_SECTION_OPTIONS.map((option) => (
          <md-select-option
            key={option.value}
            value={option.value}
            {...(option.value === songSection ? { selected: true } : {})}
          >
            <div slot="headline">{option.label}</div>
          </md-select-option>
        ))}
      </md-filled-select>

      <md-filled-select
        ref={genreRef as never}
        label="Genre"
        value={genre}
        menu-positioning="fixed"
        anchor-corner="END_START"
        menu-corner="START_START"
        className="w-full [&_::part(menu)]:!max-h-[140px] [&_::part(menu)]:overflow-y-auto"
        style={selectStyle}
      >
        {GENRE_OPTIONS.map((option) => (
          <md-select-option
            key={option.value}
            value={option.value}
            {...(option.value === genre ? { selected: true } : {})}
          >
            <div slot="headline">{option.label}</div>
          </md-select-option>
        ))}
      </md-filled-select>

      <md-filled-select
        ref={eraRef as never}
        label="Era"
        value={era}
        menu-positioning="fixed"
        anchor-corner="END_START"
        menu-corner="START_START"
        className="w-full [&_::part(menu)]:!max-h-[140px] [&_::part(menu)]:overflow-y-auto"
        style={selectStyle}
      >
        {ERA_OPTIONS.map((option) => (
          <md-select-option
            key={option.value}
            value={option.value}
            {...(option.value === era ? { selected: true } : {})}
          >
            <div slot="headline">{option.label}</div>
          </md-select-option>
        ))}
      </md-filled-select>
    </motion.div>
  );
}

function ResultCard({
  song,
  onWrongSong,
}: {
  song: SongResult;
  onWrongSong: () => void;
}) {
  const query = encodeURIComponent(`${song.title} ${song.artist}`);
  const youtubeUrl = `https://www.youtube.com/results?search_query=${query}`;
  const spotifyUrl = `https://open.spotify.com/search/${query}`;

  return (
    <div className="flex w-full max-w-sm flex-col items-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex w-full flex-col items-center"
      >
        <div className="w-full overflow-hidden rounded-3xl bg-[#f1f3f4] shadow-sm">
          {song.albumArt ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={song.albumArt}
              alt={`${song.title} album art`}
              className="aspect-square w-full object-cover"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-[#e8eaed] to-[#d2d5d9] text-sm text-black/40">
              No cover art
            </div>
          )}
        </div>

        <h2 className="mt-5 w-full text-center text-3xl font-bold leading-tight tracking-tight text-[#1f1f1f]">
          {song.title}
        </h2>
        <p className="mt-2 text-center text-lg text-black/65">{song.artist}</p>
        {(song.album || song.year) && (
          <p className="mt-1 text-center text-sm text-black/40">
            {[song.album, song.year].filter(Boolean).join(" · ")}
          </p>
        )}

        <div className="mt-6 flex items-center gap-5">
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open on YouTube"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f3f4] transition-colors hover:bg-[#e8eaed]"
          >
            <YouTubeIcon className="h-7 w-7" />
          </a>
          <a
            href={spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open on Spotify"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f3f4] transition-colors hover:bg-[#e8eaed]"
          >
            <SpotifyIcon className="h-7 w-7" />
          </a>
        </div>
      </motion.div>

      <button
        type="button"
        onClick={onWrongSong}
        className="mt-5 text-sm font-medium text-black/45 underline-offset-4 transition-colors hover:text-black/70 hover:underline"
      >
        Not the right song?
      </button>
    </div>
  );
}

function PowerResultsList({
  songs,
  onWrongSong,
}: {
  songs: SongResult[];
  onWrongSong: () => void;
}) {
  const [top, ...rest] = songs;
  if (!top) return null;

  const query = encodeURIComponent(`${top.title} ${top.artist}`);
  const youtubeUrl = `https://www.youtube.com/results?search_query=${query}`;
  const spotifyUrl = `https://open.spotify.com/search/${query}`;

  return (
    <div className="flex w-full max-w-sm flex-col">
      <div className="space-y-4">
        <motion.article
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="overflow-hidden rounded-[1.75rem] bg-[#f1f3f4] text-left"
        >
          {top.albumArt ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={top.albumArt}
              alt=""
              className="aspect-square w-full object-cover"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-[#e8eaed] to-[#d2d5d9] text-sm text-black/40">
              No cover art
            </div>
          )}
          <div className="px-5 pb-5 pt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-black/45">
                Top match
              </p>
              {typeof top.matchPercent === "number" && (
                <span className="rounded-full bg-[#1a73e8]/12 px-2.5 py-1 text-xs font-semibold text-[#1a73e8]">
                  {top.matchPercent}% match
                </span>
              )}
            </div>
            <h2 className="text-2xl font-bold leading-tight tracking-tight text-[#1f1f1f]">
              {top.title}
            </h2>
            <p className="mt-1 text-base text-black/65">{top.artist}</p>
            <div className="mt-4 flex items-center gap-3">
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open on YouTube"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white"
              >
                <YouTubeIcon className="h-6 w-6" />
              </a>
              <a
                href={spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open on Spotify"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white"
              >
                <SpotifyIcon className="h-6 w-6" />
              </a>
            </div>
          </div>
        </motion.article>

        <div className="space-y-2">
          {rest.map((song, index) => (
            <motion.article
              key={`${song.title}-${song.artist}-${index}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: 0.12 + index * 0.08,
                ease: "easeOut",
              }}
              className="flex items-center gap-3 rounded-2xl bg-[#f1f3f4] p-2.5 pr-3 text-left"
            >
              {song.albumArt ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={song.albumArt}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-black/8 text-[10px] text-black/35">
                  Art
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-[#1f1f1f]">
                  {song.title}
                </h3>
                <p className="truncate text-xs text-black/55">{song.artist}</p>
              </div>
              {typeof song.matchPercent === "number" && (
                <span className="shrink-0 rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold text-black/60">
                  {song.matchPercent}%
                </span>
              )}
            </motion.article>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onWrongSong}
        className="mt-5 self-center text-sm font-medium text-black/45 underline-offset-4 transition-colors hover:text-black/70 hover:underline"
      >
        Not the right song?
      </button>
    </div>
  );
}

export default function Home() {
  const [searchMode, setSearchMode] = useState<SearchMode>("quick");
  const [appState, setAppState] = useState<AppState>("idle");
  const [attempts, setAttempts] = useState(0);
  const [listeningElapsedMs, setListeningElapsedMs] = useState(0);
  const [songs, setSongs] = useState<SongResult[]>([]); // only filled from analyzeAudio — never mock/defaults
  const [genre, setGenre] = useState<string>(GENRE_OPTIONS[0].value);
  const [lyrics, setLyrics] = useState("");
  const [era, setEra] = useState<string>(ERA_OPTIONS[0].value);
  const [songSection, setSongSection] = useState("any");

  const {
    startRecording,
    stopRecording,
    audioVolume,
    error: micError,
  } = useAudioRecorder();

  const analyzingRef = useRef(false);
  const attemptsRef = useRef(0);
  const listeningStartedAtRef = useRef<number | null>(null);
  const searchModeRef = useRef(searchMode);
  const filtersRef = useRef({ genre, lyrics, era, songSection });
  const listenTimeoutRef = useRef<number | null>(null);
  const [listenSession, setListenSession] = useState(0);

  useEffect(() => {
    filtersRef.current = { genre, lyrics, era, songSection };
  }, [genre, lyrics, era, songSection]);

  useEffect(() => {
    searchModeRef.current = searchMode;
  }, [searchMode]);

  const clearListenTimeout = useCallback(() => {
    if (listenTimeoutRef.current !== null) {
      window.clearTimeout(listenTimeoutRef.current);
      listenTimeoutRef.current = null;
    }
  }, []);

  const startQuickListening = useCallback(() => {
    analyzingRef.current = false;
    setSongs([]);
    setListeningElapsedMs(0);
    listeningStartedAtRef.current = Date.now();
    setSearchMode("quick");
    setListenSession((value) => value + 1);
    setAppState("listening");
  }, []);

  const enterPowerFilters = useCallback(async () => {
    analyzingRef.current = false;
    clearListenTimeout();
    await stopRecording();
    setSongs([]);
    setListeningElapsedMs(0);
    listeningStartedAtRef.current = null;
    setSearchMode("power");
    setAppState("idle");
  }, [clearListenTimeout, stopRecording]);

  const tryAgainFromFilters = useCallback(() => {
    analyzingRef.current = false;
    setSongs([]);
    setListeningElapsedMs(0);
    listeningStartedAtRef.current = Date.now();
    setSearchMode("power");
    setListenSession((value) => value + 1);
    setAppState("listening");
  }, []);

  const resetSession = useCallback(async () => {
    analyzingRef.current = false;
    clearListenTimeout();
    listeningStartedAtRef.current = null;
    await stopRecording();
    setListeningElapsedMs(0);
    setSongs([]);
    attemptsRef.current = 0;
    setAttempts(0);
    setGenre(GENRE_OPTIONS[0].value);
    setLyrics("");
    setEra(ERA_OPTIONS[0].value);
    setSongSection("any");
    setSearchMode("quick");
    setAppState("idle");
  }, [clearListenTimeout, stopRecording]);

  const goBackFromHardFail = useCallback(() => {
    analyzingRef.current = false;
    clearListenTimeout();
    listeningStartedAtRef.current = null;
    setSongs([]);
    setListeningElapsedMs(0);
    attemptsRef.current = 0;
    setAttempts(0);
    setGenre(GENRE_OPTIONS[0].value);
    setLyrics("");
    setEra(ERA_OPTIONS[0].value);
    setSongSection("any");
    setSearchMode("quick");
    setAppState("idle");
  }, [clearListenTimeout]);

  const handleNoMatch = useCallback(() => {
    const nextAttempts = attemptsRef.current + 1;
    attemptsRef.current = nextAttempts;
    setAttempts(nextAttempts);
    setSongs([]);
    analyzingRef.current = false;

    if (nextAttempts >= 2) {
      setAppState("hard-fail");
      return;
    }

    setSearchMode("power");
    setAppState("idle");
  }, []);

  const runAnalysis = useCallback(async () => {
    if (analyzingRef.current) return;
    analyzingRef.current = true;
    clearListenTimeout();

    const modeAtStop = searchModeRef.current;
    const filters = filtersRef.current;
    const blob = await stopRecording();
    setAppState("analyzing");
    listeningStartedAtRef.current = null;

    const result = await analyzeAudio(blob, {
      searchMode: modeAtStop,
      lyrics: filters.lyrics,
      genre: filters.genre,
      era: filters.era,
      songSection: filters.songSection,
    });

    console.log("[page] analyzeAudio final result", result);

    // Only enter Results with real backend songs — never mock / empty payloads
    const hasRealSongs =
      result.success === true &&
      result.ok === true &&
      Array.isArray(result.songs) &&
      result.songs.length > 0 &&
      result.songs.every(
        (song) => song.title?.trim() && song.artist?.trim(),
      );

    if (hasRealSongs) {
      setSongs(result.songs);
      setAppState("result");
      analyzingRef.current = false;
      return;
    }

    // success:false / no songs → increment attempts → filters or hard-fail
    console.log("[page] No confident match — running failure routing", {
      attemptsBefore: attemptsRef.current,
      success: result.success,
    });
    handleNoMatch();
  }, [clearListenTimeout, handleNoMatch, stopRecording]);

  const handleDoneListening = useCallback(() => {
    clearListenTimeout();
    void runAnalysis();
  }, [clearListenTimeout, runAnalysis]);

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
          // Stay on listening UI; micError surfaces in the centered area.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appState, startRecording, searchMode, listenSession]);

  // Progressive listening copy for both quick and power listening
  useEffect(() => {
    if (appState !== "listening") return;

    const tick = () => {
      const startedAt = listeningStartedAtRef.current ?? Date.now();
      setListeningElapsedMs(Date.now() - startedAt);
    };

    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [appState, listenSession]);

  // Auto-stop after 20s while listening → analyze with audio so far
  useEffect(() => {
    if (appState !== "listening") return;

    clearListenTimeout();
    listenTimeoutRef.current = window.setTimeout(() => {
      listenTimeoutRef.current = null;
      void runAnalysis();
    }, STAGE_1_TIMEOUT_MS);

    return () => {
      clearListenTimeout();
    };
  }, [appState, listenSession, runAnalysis, clearListenTimeout]);

  const showPowerFilters = appState === "idle" && searchMode === "power";
  const showQuickIdle = appState === "idle" && searchMode === "quick";

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-200 p-6">
      <div
        data-search-mode={searchMode}
        data-app-state={appState}
        data-attempts={attempts}
        className="relative h-[874px] w-[402px] overflow-hidden rounded-[55px] border-[14px] border-black bg-white text-[#1f1f1f] shadow-2xl"
      >
        {/* Dynamic Island */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-2 z-50 h-[35px] w-[120px] -translate-x-1/2 rounded-full bg-black"
        />

        {/* Global fixed header */}
        <header className="absolute top-0 right-0 left-0 z-30 flex items-center justify-between bg-transparent px-6 pt-12">
          <button
            type="button"
            aria-label="Back"
            onClick={() => {
              void resetSession();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#1f1f1f]/80 transition-colors hover:bg-black/5"
          >
            <ChevronLeft className="h-7 w-7" strokeWidth={1.75} />
          </button>

          <GoogleGLogo className="h-7 w-7" />

          <button
            type="button"
            aria-label="History"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#1f1f1f]/70 transition-colors hover:bg-black/5"
          >
            <History className="h-6 w-6" strokeWidth={1.75} />
          </button>
        </header>

        {/* Clears absolute header + Dynamic Island; content centers in remaining space */}
        <main className="relative z-10 flex h-full w-full flex-col items-center justify-center overflow-y-auto px-6 pt-28 pb-24 text-center">
          {showQuickIdle && (
            <div className="flex w-full flex-col items-center">
              <h1 className="text-6xl font-bold leading-none tracking-tight text-[#1f1f1f] sm:text-7xl">
                <span className="block">Play</span>
                <span className="block">Sing</span>
                <span className="block">Hum</span>
              </h1>
              <p className="mt-6 max-w-[240px] text-base text-black/55">
                Search a song by playing, singing, or humming it.
              </p>
              <button
                type="button"
                aria-label="Start listening"
                onClick={startQuickListening}
                className="mt-10 flex h-16 w-16 items-center justify-center rounded-full bg-[#1a73e8] text-white shadow-lg transition-transform hover:bg-[#1557b0] active:scale-95"
              >
                <Mic className="h-7 w-7" strokeWidth={2} />
              </button>
            </div>
          )}

          {showPowerFilters && (
            <div className="relative z-20 flex w-full max-w-sm flex-col items-center overflow-visible">
              <h1 className="mb-6 text-center text-2xl font-medium text-[#1f1f1f]">
                Humming was tricky? Let&apos;s narrow it down.
              </h1>

              <PowerSearchFilters
                genre={genre}
                lyrics={lyrics}
                era={era}
                songSection={songSection}
                onGenreChange={setGenre}
                onLyricsChange={setLyrics}
                onEraChange={setEra}
                onSongSectionChange={setSongSection}
              />

              <button
                type="button"
                onClick={tryAgainFromFilters}
                className="mt-8 rounded-full bg-[#1a73e8] px-8 py-3 font-medium text-white shadow-none transition-all hover:bg-[#1557b0] active:scale-[0.98]"
              >
                Try again
              </button>
            </div>
          )}

          {appState === "listening" && (
            <>
              <ListeningHeadline elapsedMs={listeningElapsedMs} />
              {micError && (
                <p className="mt-6 max-w-[260px] text-center text-sm text-red-600">
                  {micError}
                </p>
              )}
            </>
          )}

          {appState === "analyzing" && <AnalyzingLoader />}

          {appState === "hard-fail" && (
            <div className="flex w-full max-w-sm flex-col items-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#f1f3f4]">
                <SearchX
                  className="h-12 w-12 text-black/35"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </div>
              <h1 className="mt-6 text-center text-2xl font-bold tracking-tight text-[#1f1f1f]">
                Sorry, we couldn&apos;t find it.
              </h1>
              <button
                type="button"
                onClick={goBackFromHardFail}
                className="mt-8 rounded-full bg-[#1a73e8] px-8 py-3 font-medium text-white shadow-none transition-all hover:bg-[#1557b0] active:scale-[0.98]"
              >
                Go back
              </button>
            </div>
          )}

          {appState === "result" &&
            songs.length > 0 &&
            searchMode === "quick" && (
              <ResultCard
                song={songs[0]}
                onWrongSong={() => {
                  void enterPowerFilters();
                }}
              />
            )}

          {appState === "result" &&
            songs.length > 0 &&
            searchMode === "power" && (
              <PowerResultsList
                songs={songs}
                onWrongSong={() => {
                  void enterPowerFilters();
                }}
              />
            )}

          {/* Never leave a blank phone after a failed/empty result state */}
          {appState === "result" && songs.length === 0 && (
            <div className="relative z-20 flex w-full max-w-sm flex-col items-center overflow-visible">
              <h1 className="mb-6 text-center text-2xl font-medium text-[#1f1f1f]">
                Humming was tricky? Let&apos;s narrow it down.
              </h1>
              <PowerSearchFilters
                genre={genre}
                lyrics={lyrics}
                era={era}
                songSection={songSection}
                onGenreChange={setGenre}
                onLyricsChange={setLyrics}
                onEraChange={setEra}
                onSongSectionChange={setSongSection}
              />
              <button
                type="button"
                onClick={tryAgainFromFilters}
                className="mt-8 rounded-full bg-[#1a73e8] px-8 py-3 font-medium text-white shadow-none transition-all hover:bg-[#1557b0] active:scale-[0.98]"
              >
                Try again
              </button>
            </div>
          )}
        </main>

        {appState === "listening" && (
          <>
            <div className="pointer-events-none absolute inset-x-0 bottom-[118px] z-20 flex justify-center px-6">
              <button
                type="button"
                onClick={handleDoneListening}
                className="pointer-events-auto rounded-full border border-black/15 bg-black/55 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/65"
              >
                I&apos;m done here
              </button>
            </div>
            <ReactiveBottomWave audioVolume={audioVolume} />
          </>
        )}
      </div>
    </div>
  );
}
