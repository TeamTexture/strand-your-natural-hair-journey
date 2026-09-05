// The primary voice-note artefact: a proper player row that sits ABOVE the
// transcription everywhere a recording and its text appear together.
//
// Sand container, gold circular play button, a simple waveform (gold for
// played, border-tone for unplayed) and the duration on the right. Scrubbing
// works by tapping/dragging anywhere across the waveform.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause } from "lucide-react";
import { cn } from "@/lib/utils";

/** Every mounted player, so starting one pauses the others. */
const activeAudios = new Set<HTMLAudioElement>();

const pauseOthers = (keep: HTMLAudioElement) => {
  activeAudios.forEach((a) => {
    if (a !== keep && !a.paused) a.pause();
  });
};

const mmss = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const t = Math.floor(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

const BARS = 34;

/** Deterministic, pleasant-looking bar heights (no random re-render jitter). */
const barHeights = Array.from({ length: BARS }, (_, i) => {
  const wave = Math.sin(i * 0.9) * 0.5 + Math.sin(i * 0.37) * 0.35;
  return Math.round(34 + Math.abs(wave) * 62);
});

interface Props {
  url: string | null | undefined;
  /** Fallback duration when audio metadata has not loaded yet. */
  durationSec?: number | null;
  mediaName?: string;
  className?: string;
}

const VoiceNotePlayerRow = ({
  url,
  durationSec,
  mediaName = "voice note",
  className,
}: Props) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [metaDuration, setMetaDuration] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const fallback =
    durationSec && Number.isFinite(durationSec) && durationSec > 0 ? durationSec : null;
  const total = metaDuration ?? fallback;
  const hasTotal = !!total && Number.isFinite(total) && total > 0;

  useEffect(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
    }
    setPlaying(false);
    setElapsed(0);
    setMetaDuration(null);
  }, [url]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    activeAudios.add(el);
    return () => {
      el.pause();
      activeAudios.delete(el);
    };
  }, []);

  const toggle = () => {
    const el = audioRef.current;
    if (!el || !url) return;
    if (el.paused) {
      pauseOthers(el);
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  };

  const seekToRatio = useCallback(
    (ratio: number) => {
      const el = audioRef.current;
      if (!el || !hasTotal) return;
      const next = Math.min(Math.max(ratio, 0), 1) * (total as number);
      setElapsed(next);
      try {
        el.currentTime = next;
      } catch {
        /* not seekable yet */
      }
    },
    [hasTotal, total],
  );

  const ratioFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return (clientX - rect.left) / rect.width;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!hasTotal) return;
    e.preventDefault();
    e.stopPropagation();
    setScrubbing(true);
    seekToRatio(ratioFromClientX(e.clientX));
  };

  useEffect(() => {
    if (!scrubbing) return;
    const move = (e: PointerEvent) => seekToRatio(ratioFromClientX(e.clientX));
    const up = () => setScrubbing(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [scrubbing, seekToRatio]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!hasTotal) return;
    const t = total as number;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      seekToRatio((elapsed - 5) / t);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      seekToRatio((elapsed + 5) / t);
    }
  };

  const ratio = hasTotal ? Math.min(1, Math.max(0, elapsed / (total as number))) : 0;
  const playedBars = Math.round(ratio * BARS);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[11px] bg-secondary px-3 py-2.5",
        className,
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        disabled={!url}
        aria-label={`${playing ? "Pause" : "Play"} ${mediaName}`}
        className="shrink-0 size-8 rounded-full bg-primary flex items-center justify-center disabled:opacity-50"
      >
        {playing ? (
          <Pause className="size-3.5 text-primary-foreground fill-current" />
        ) : (
          <span
            aria-hidden
            className="ml-[2px] block border-y-[6px] border-y-transparent border-l-[9px] border-l-primary-foreground"
          />
        )}
      </button>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={`Seek ${mediaName}`}
        aria-valuemin={0}
        aria-valuemax={hasTotal ? Math.round(total as number) : 0}
        aria-valuenow={Math.round(elapsed)}
        aria-valuetext={mmss(elapsed)}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className="flex-1 min-w-0 h-6 flex items-center gap-[2px] cursor-pointer touch-none select-none outline-none"
      >
        {barHeights.map((h, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "flex-1 rounded-full",
              i < playedBars ? "bg-primary" : "bg-border",
            )}
            style={{ height: `${(h / 100) * 22}px` }}
          />
        ))}
      </div>

      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground font-body">
        {hasTotal ? mmss(playing || elapsed > 0 ? elapsed : (total as number)) : "—"}
      </span>

      <audio
        ref={audioRef}
        src={url ?? undefined}
        preload="metadata"
        className="hidden"
        onPlay={() => {
          if (audioRef.current) pauseOthers(audioRef.current);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setElapsed(0);
        }}
        onLoadedMetadata={(e) => {
          const d = (e.currentTarget as HTMLAudioElement).duration;
          if (Number.isFinite(d) && d > 0) setMetaDuration(d);
        }}
        onTimeUpdate={(e) => {
          if (!scrubbing) setElapsed((e.currentTarget as HTMLAudioElement).currentTime);
        }}
      />
    </div>
  );
};

export default VoiceNotePlayerRow;
