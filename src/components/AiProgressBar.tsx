import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /**
   * Rotating stage captions. Each is shown for roughly an equal slice of the
   * expected wait, so the member can see the work moving on rather than a
   * single static line that reads as frozen.
   */
  stages?: string[];
  /** Expected wait in ms. The bar eases toward — but never reaches — 100%. */
  expectedMs?: number;
  /** Shown once the wait exceeds the expectation, so nothing looks stuck. */
  overrunNote?: string;
  /** Tighter type/spacing for use inside a small card row. */
  compact?: boolean;
  className?: string;
}

const DEFAULT_STAGES = [
  "Reading your hair profile",
  "Checking your recent wash days",
  "Looking this up in the manuscript",
  "Writing your guidance",
];

/**
 * STRAND AI wait state — a determinate-feeling gold progress bar with rotating
 * stage captions. Personalised guidance can take a while (profile read,
 * manuscript retrieval, generation, verification); this makes that wait legible
 * instead of letting the member think the screen has frozen.
 *
 * The bar is honest about being an estimate: it eases asymptotically toward 95%
 * and, if the work overruns, says so in words rather than sitting still.
 */
const AiProgressBar = ({
  stages,
  expectedMs = 14000,
  overrunNote = "Still working — this one's taking a little longer than usual.",
  compact = false,
  className,
}: Props) => {
  const steps = useMemo(
    () => (stages && stages.length > 0 ? stages : DEFAULT_STAGES),
    [stages],
  );
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    startedAt.current = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Date.now() - startedAt.current);
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  // Asymptotic ease: fast at the start, never completes on its own.
  const pct = Math.min(95, 95 * (1 - Math.exp(-2.2 * (elapsed / expectedMs))));
  const overrun = elapsed > expectedMs;
  const stageIndex = Math.min(
    steps.length - 1,
    Math.floor((elapsed / expectedMs) * steps.length),
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("w-full", compact ? "space-y-1.5" : "space-y-2", className)}
    >
      <div className="h-1 w-full overflow-hidden rounded-full bg-primary/15">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p
        className={cn(
          "font-body text-muted-foreground",
          compact ? "text-[11px] leading-[1.5]" : "text-[11.5px] leading-[1.55]",
        )}
      >
        {overrun ? overrunNote : `${steps[stageIndex]}…`}
      </p>
    </div>
  );
};

export default AiProgressBar;
