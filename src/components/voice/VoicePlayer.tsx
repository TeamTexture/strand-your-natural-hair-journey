// Shared scrubbable voice-note player.
//
// One component for every surface that plays back a recorded voice note: chat
// bubbles, cards, sheets, the welcome popup, review previews. It owns its own
// hidden <audio> element and a small module-level registry so only one voice
// note can ever play at a time app-wide (no context provider needed).
//
// Colours come from `currentColor` plus the variant, so the same markup reads
// correctly inside the gold "mine" chat bubble, the brown received bubble and
// on a warm-white card.
//
// Recording/capture controls are deliberately NOT part of this component.

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/** Every mounted player's audio element, so a new play can pause the rest. */
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

export interface VoicePlayerProps {
  url: string | null | undefined;
  /** Fallback total duration when audio metadata has not loaded yet. */
  durationMs?: number | null;
  /** "onDark" for coloured chat bubbles, "onSurface" for cards and sand. */
  variant?: "onDark" | "onSurface";
  className?: string;
}

const VoicePlayer = ({
  url,
  durationMs,
  variant = "onSurface",
  className,
}: VoicePlayerProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [metaDuration, setMetaDuration] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);

  const fallbackDuration =
    durationMs && Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : null;
  const total = metaDuration ?? fallbackDuration;
  const hasTotal = !!total && Number.isFinite(total) && total > 0;

  // A new recording means a fresh transport.
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

  // Registry membership + teardown.
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
    setScrubbing(true);
    seekToRatio(ratioFromClientX(e.clientX));
  };

  // Pointer move/up on window so a drag keeps tracking outside the 16px strip.
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
    } else if (e.key === "Home") {
      e.preventDefault();
      seekToRatio(0);
    } else if (e.key === "End") {
      e.preventDefault();
      seekToRatio(1);
    }
  };

  const pct = hasTotal ? Math.min(100, Math.max(0, (elapsed / (total as number)) * 100)) : 0;

  const onDark = variant === "onDark";
  const buttonTone = onDark
    ? "bg-background/25 text-current"
    : "bg-primary text-primary-foreground";

  return (
    <div className={cn("flex items-center gap-2.5 min-w-0", className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={cn(
          "shrink-0 size-9 rounded-full flex items-center justify-center disabled:opacity-50",
          buttonTone,
        )}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 ml-[1px]" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek voice note"
          aria-valuemin={0}
          aria-valuemax={hasTotal ? Math.round(total as number) : 0}
          aria-valuenow={Math.round(elapsed)}
          aria-valuetext={mmss(elapsed)}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          className="relative h-4 flex items-center cursor-pointer touch-none select-none outline-none"
        >
          <div className="relative h-1 w-full rounded-full overflow-visible">
            <div
              aria-hidden
              className="absolute inset-0 rounded-full bg-current opacity-[0.28]"
            />

            <div
              className="absolute inset-y-0 left-0 rounded-full bg-current"
              style={{ width: `${pct}%` }}
            />
            <span
              aria-hidden
              className="absolute top-1/2 size-[13px] -translate-y-1/2 -translate-x-1/2 rounded-full bg-current shadow-sm"
              style={{ left: `${pct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] tabular-nums opacity-75 leading-none pt-1">
          <span>{mmss(elapsed)}</span>
          {hasTotal && <span>{mmss(total as number)}</span>}
        </div>
      </div>

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
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setMetaDuration(d);
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setMetaDuration(d);
        }}
        onTimeUpdate={(e) => {
          if (!scrubbing) setElapsed(e.currentTarget.currentTime);
        }}
      />
    </div>
  );
};

export default VoicePlayer;
