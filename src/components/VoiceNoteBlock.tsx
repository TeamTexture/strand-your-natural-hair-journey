import { Mic } from "lucide-react";
import VoiceNotePlayerRow from "@/components/voice/VoiceNotePlayerRow";
import TranscriptView from "@/components/voice/TranscriptView";
import { cn } from "@/lib/utils";

/**
 * A recorded note: the player first (the recording is the primary artefact),
 * then the transcription formatted for reading, then any captured attributes as
 * chips. The transcript is tidied but never rewritten, and the raw version
 * stays reachable inside the expanded state.
 */
const VoiceNoteBlock = ({
  label = "Your hair feel note",
  transcript,
  audioUrl,
  durationSec,
  chips,
  className,
  id,
}: {
  label?: string;
  transcript?: string | null;
  audioUrl?: string | null;
  durationSec?: number | null;
  /** Captured attributes shown as chips beneath the text. */
  chips?: string[];
  className?: string;
  id?: string;
}) => {
  const text = (transcript ?? "").trim();
  const hasAudio = !!audioUrl;
  const chipList = (chips ?? []).filter((c) => !!c && c.trim().length > 0);
  if (!text && !hasAudio && chipList.length === 0) return null;

  return (
    <div id={id} className={cn("space-y-2.5", className)}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium flex items-center gap-1.5">
        <Mic className="size-3" /> {label}
      </p>

      {hasAudio && <VoiceNotePlayerRow url={audioUrl} durationSec={durationSec} mediaName="recording" />}

      {text && <TranscriptView text={text} />}

      {chipList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chipList.map((c) => (
            <span
              key={c}
              className="rounded-[20px] bg-secondary px-[11px] py-[5px] text-[12px] text-foreground font-body break-words"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default VoiceNoteBlock;
