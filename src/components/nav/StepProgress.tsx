import { cn } from "@/lib/utils";

/**
 * StepProgress — the visible position marker for every multi-step logging flow.
 *
 * Shows the current step as a numeral ("Step 2 of 5") plus a gold dot/line
 * track. No flow should ever leave the user guessing how much is left.
 */
const StepProgress = ({
  current,
  total,
  label,
  className,
}: {
  /** 1-indexed. */
  current: number;
  total: number;
  /** Optional name of the current step, e.g. "Scalp check". */
  label?: string;
  className?: string;
}) => (
  <div className={cn("px-1", className)}>
    <div className="flex items-baseline justify-between gap-2">
      <p className="text-[10px] uppercase tracking-[0.2em] font-bold font-body text-primary">
        Step {current} of {total}
      </p>
      {label && (
        <p className="text-[11px] font-body text-muted-foreground truncate max-w-[55%]">{label}</p>
      )}
    </div>
    <div
      className="mt-2 flex items-center gap-1.5"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-label={`Step ${current} of ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => {
        const done = i + 1 < current;
        const active = i + 1 === current;
        return (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all",
              active ? "bg-primary" : done ? "bg-primary/55" : "bg-primary/15",
            )}
          />
        );
      })}
    </div>
  </div>
);

export default StepProgress;
