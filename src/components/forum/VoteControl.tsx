import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  score: number;
  myVote: -1 | 0 | 1;
  onVote: (next: -1 | 0 | 1) => void;
  size?: "sm" | "md";
  disabled?: boolean;
}

/** Up/down pair with the true net score between them. Tapping the active arrow clears the vote. */
const VoteControl = ({ score, myVote, onVote, size = "md", disabled = false }: Props) => {
  const dim = size === "md" ? "h-8" : "h-7";
  const icon = size === "md" ? "size-3.5" : "size-3";
  const text = size === "md" ? "text-[11px]" : "text-[10.5px]";

  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-full border border-border bg-card px-1", dim)}>
      <button
        type="button"
        disabled={disabled}
        aria-label="Upvote"
        aria-pressed={myVote === 1}
        onClick={() => onVote(myVote === 1 ? 0 : 1)}
        className={cn(
          "size-6 rounded-full flex items-center justify-center transition-colors disabled:opacity-50",
          myVote === 1 ? "text-primary bg-primary/15" : "text-foreground/55 hover:text-primary hover:bg-primary/10",
        )}
      >
        <ArrowUp className={icon} />
      </button>
      <span className={cn("font-body font-semibold tabular-nums min-w-4 text-center", text)}>{score}</span>
      <button
        type="button"
        disabled={disabled}
        aria-label="Downvote"
        aria-pressed={myVote === -1}
        onClick={() => onVote(myVote === -1 ? 0 : -1)}
        className={cn(
          "size-6 rounded-full flex items-center justify-center transition-colors disabled:opacity-50",
          myVote === -1 ? "text-alert-dark bg-alert-dark/15" : "text-foreground/55 hover:text-alert-dark hover:bg-alert-dark/10",
        )}
      >
        <ArrowDown className={icon} />
      </button>
    </div>
  );
};

export default VoteControl;
