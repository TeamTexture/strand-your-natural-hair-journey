import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, type GuidanceTone } from "@/lib/guidance";

/**
 * AnchorStat — the visual hero of a guidance card.
 *
 * The single most important fact (a count, a duration, a gap) is rendered as a
 * large numeral with its context as small text beside it, never buried inside a
 * sentence. An optional target/benchmark sits directly underneath as a pill.
 */
const AnchorStat = ({
  value,
  context,
  target,
  targetIcon: TargetIcon,
  tone = "gold",
  className,
}: {
  value: ReactNode;
  context: ReactNode;
  /** Benchmark shown as a pill under the stat, e.g. "Your rhythm: every 7 days". */
  target?: ReactNode;
  targetIcon?: LucideIcon;
  tone?: GuidanceTone;
  className?: string;
}) => {
  return (
    <div className={cn("mt-2", className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {/* Hero stat — large sans-serif, numeral AND unit together, ink colour. */}
        <span className="font-body text-[34px] font-semibold leading-none tracking-tight text-foreground">
          {value}
        </span>
        <span className="text-[13px] leading-snug text-muted-foreground font-body break-words">
          {context}
        </span>
      </div>
      {target && (
        <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-pill bg-primary/12 px-3 py-1.5 text-[11px] font-semibold font-body text-primary">
          {TargetIcon && <TargetIcon className="size-3.5" aria-hidden />}
          {target}
        </span>
      )}
    </div>
  );
};

export default AnchorStat;
