import { useState } from "react";
import { Mic } from "lucide-react";
import VoicePlayer from "@/components/voice/VoicePlayer";
import { toParagraphs } from "@/lib/formatTranscript";
import { cn } from "@/lib/utils";



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

  const text = (transcript ?? "").trim();
  const paragraphs = text ? toParagraphs(text) : [];
  const hasAudio = !!audioUrl;
  // Short notes fit inside the preview, so there is nothing to expand.
  const clampable = text.length > 170 || paragraphs.length > 1;
  if (!text && !hasAudio) return null;

  return (
    <div id={id} className={cn("space-y-2", className)}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium flex items-center gap-1.5">
        <Mic className="size-3" /> {label}
      </p>

      {hasAudio && (
        <div className="text-foreground">
          <VoicePlayer url={audioUrl} variant="onSurface" mediaName="recording" />

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
