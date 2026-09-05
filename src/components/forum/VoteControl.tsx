import { ChevronUp, ChevronDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  score: number;
  myVote: -1 | 0 | 1;
  onVote: (next: -1 | 0 | 1) => void;
  size?: "sm" | "md";
  disabled?: boolean;
  /** "vertical" = Reddit-style stacked chevrons with the score between them. */
  orientation?: "horizontal" | "vertical";
}

/** Up/down pair with the true net score between them. Tapping the active arrow clears the vote. */
const VoteControl = ({
  score,
  myVote,
  onVote,
  size = "md",
  disabled = false,
  orientation = "horizontal",
}: Props) => {
  const vertical = orientation === "vertical";
  const icon = vertical ? (size === "md" ? "size-4" : "size-3.5") : size === "md" ? "size-3.5" : "size-3";
  const text = vertical
    ? size === "md"
      ? "text-[12px]"
      : "text-[11px]"
    : size === "md"
      ? "text-[11px]"
      : "text-[10.5px]";
  const btn = vertical ? (size === "md" ? "size-6" : "size-5") : "size-6";

  const Up = vertical ? ChevronUp : ArrowUp;
  const Down = vertical ? ChevronDown : ArrowDown;

  return (
    <div
      className={cn(
        vertical
          ? "inline-flex flex-col items-center gap-0 shrink-0 select-none"
          : cn(
              "inline-flex items-center gap-0.5 rounded-full border border-border bg-card px-1",
              size === "md" ? "h-8" : "h-7",
            ),
      )}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label="Upvote"
        aria-pressed={myVote === 1}
        onClick={() => onVote(myVote === 1 ? 0 : 1)}
        className={cn(
          "rounded-full flex items-center justify-center transition-colors disabled:opacity-50",
          btn,
          myVote === 1 ? "text-primary bg-primary/15" : "text-foreground/45 hover:text-primary hover:bg-primary/10",
        )}
      >
        <Up className={icon} />
      </button>
      <span
        className={cn(
          "font-body font-semibold tabular-nums text-center",
          vertical ? "leading-none py-0.5 min-w-5" : "min-w-4",
          text,
          myVote === 1 && "text-primary",
          myVote === -1 && "text-alert-dark",
          // A zero score should not read as loudly as a real number.
          myVote === 0 && (score === 0 ? "text-foreground/35" : "text-foreground/70"),
        )}
      >
        {score}
      </span>
      <button
        type="button"
        disabled={disabled}
        aria-label="Downvote"
        aria-pressed={myVote === -1}
        onClick={() => onVote(myVote === -1 ? 0 : -1)}
        className={cn(
          "rounded-full flex items-center justify-center transition-colors disabled:opacity-50",
          btn,
          myVote === -1 ? "text-alert-dark bg-alert-dark/15" : "text-foreground/45 hover:text-alert-dark hover:bg-alert-dark/10",
        )}
      >
        <Down className={icon} />
      </button>
    </div>
  );
};

export default VoteControl;
