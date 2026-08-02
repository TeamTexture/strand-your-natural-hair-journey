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
  const t = TONE_CLASSES[tone];
  return (
    <div className={cn("mt-2", className)}>
      <div className="flex items-baseline gap-2">
        <span className={cn("font-display text-2xl leading-none tabular-nums", t.icon)}>
          {value}
        </span>
        <span className="text-[12px] leading-snug text-foreground/75 font-body break-words">
          {context}
        </span>
      </div>
      {target && (
        <span
          className={cn(
            "mt-2 inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[10.5px] font-semibold font-body",
            t.chip,
            t.label,
          )}
        >
          {TargetIcon && <TargetIcon className="size-3" aria-hidden />}
          {target}
        </span>
      )}
    </div>
  );
};

export default AnchorStat;
