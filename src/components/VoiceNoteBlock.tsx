import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { toParagraphs } from "@/lib/formatTranscript";
import { cn } from "@/lib/utils";

const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * A recorded note: the member's own words, collapsed to a short preview with a
 * "See more" control, plus a minimal play/pause for the recording when one
 * exists. The transcript text is never edited — only clamped.
 */
const VoiceNoteBlock = ({
  label = "Your hair feel note",
  transcript,
  audioUrl,
  className,
  id,
}: {
  label?: string;
  transcript?: string | null;
  audioUrl?: string | null;
  className?: string;
  id?: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // A new signed URL means a different recording — reset the transport.
  useEffect(() => {
    setPlaying(false);
    setElapsed(0);
  }, [audioUrl]);

  const text = (transcript ?? "").trim();
  const paragraphs = text ? toParagraphs(text) : [];
  const hasAudio = !!audioUrl;
  // Short notes fit inside the preview, so there is nothing to expand.
  const clampable = text.length > 170 || paragraphs.length > 1;
  if (!text && !hasAudio) return null;

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  return (
    <div id={id} className={cn("space-y-2", className)}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium flex items-center gap-1.5">
        <Mic className="size-3" /> {label}
      </p>

      {hasAudio && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause recording" : "Play recording"}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4 ml-[1px]" />}
          </button>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {mmss(elapsed)}
          </span>
          <audio
            ref={audioRef}
            src={audioUrl ?? undefined}
            preload="metadata"
            className="hidden"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); setElapsed(0); }}
            onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
          />
        </div>
      )}

      {text && (
        <>
          {expanded && clampable ? (
            <div className="space-y-3">
              {paragraphs.map((para, i) => (
                <p key={i} className="text-sm leading-relaxed">{para}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-relaxed line-clamp-3">{text}</p>
          )}
          {clampable && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] font-medium uppercase tracking-[0.12em] text-primary"
          >
            {expanded ? "See less" : "See more"}
          </button>
          )}
        </>
      )}
    </div>
  );
};

export default VoiceNoteBlock;
