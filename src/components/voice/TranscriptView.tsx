// A spoken transcript, formatted for reading.
//
// The recording is the source of truth; this is the supporting text. It is
// tidied (filler, stammers, punctuation) but never rewritten or summarised —
// the member's own wording stays. The first few paragraphs show as a preview
// with a READ ALL control, and the raw unedited transcript is always reachable
// once expanded so nothing she said is lost.

import { useState } from "react";
import { cleanTranscript, toParagraphs } from "@/lib/formatTranscript";
import { cn } from "@/lib/utils";

const PREVIEW_PARAGRAPHS = 3;

interface Props {
  text: string | null | undefined;
  className?: string;
  /** Text size for the body copy. */
  size?: "sm" | "xs";
}

const TranscriptView = ({ text, className, size = "sm" }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const raw = (text ?? "").trim();
  if (!raw) return null;

  const cleaned = cleanTranscript(raw) || raw;
  const paragraphs = toParagraphs(cleaned);
  const shown = expanded ? paragraphs : paragraphs.slice(0, PREVIEW_PARAGRAPHS);
  const hasMore = paragraphs.length > PREVIEW_PARAGRAPHS;

  const body = size === "xs" ? "text-[12px]" : "text-[13px]";

  return (
    <div className={cn("space-y-2", className)}>
      {shown.map((para, i) => (
        <p key={i} className={cn(body, "leading-relaxed font-body break-words")}>
          {para}
        </p>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
            if (expanded) setShowRaw(false);
          }}
          className="text-[11px] uppercase tracking-[0.16em] text-primary font-body"
        >
          {expanded ? "Read less" : "Read all"}
        </button>
      )}

      {expanded && (
        <div className="pt-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowRaw((v) => !v);
            }}
            className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-body"
          >
            {showRaw ? "Hide original transcript" : "Original transcript"}
          </button>
          {showRaw && (
            <p className="mt-1.5 text-[11.5px] leading-relaxed font-body text-muted-foreground whitespace-pre-line break-words">
              {raw}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TranscriptView;
