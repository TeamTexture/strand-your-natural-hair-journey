import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, type GuidanceTone } from "@/lib/guidance";

/**
 * GuidanceCard — the shell every AI guidance surface sits in.
 *
 * Eyebrow label (with icon) → headline → structured body. The body is never a
 * prose wall: it is composed of SegmentBlocks, ActionRows, KeyFactChips and
 * StepSequences.
 */
const GuidanceCard = ({
  eyebrow,
  icon: Icon,
  headline,
  tone = "gold",
  compact = false,
  headerRight,
  footer,
  className,
  children,
}: {
  eyebrow?: string;
  icon?: LucideIcon;
  headline?: ReactNode;
  tone?: GuidanceTone;
  /** Level 1–2 density: tighter padding and spacing. */
  compact?: boolean;
  headerRight?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}) => {
  const t = TONE_CLASSES[tone];
  return (
    <section
      className={cn(
        "rounded-[14px] border text-foreground",
        t.box,
        compact ? "p-3" : "p-4",
        className,
      )}
    >
      {(eyebrow || headerRight) && (
        <div className="flex items-start justify-between gap-2">
          {eyebrow && (
            <div className="flex items-center gap-1.5 min-w-0">
              {Icon && <Icon className={cn("size-3.5 shrink-0", t.icon)} aria-hidden />}
              <p className={cn("text-[10px] uppercase tracking-[0.18em] font-bold font-body truncate", t.label)}>
                {eyebrow}
              </p>
            </div>
          )}
          {headerRight}
        </div>
      )}
      {headline && (
        <h3 className="font-display text-[15.5px] leading-snug mt-1.5 break-words">
          {headline}
        </h3>
      )}
      {children && <div className={cn("min-w-0", compact ? "mt-2 space-y-2" : "mt-3 space-y-3")}>{children}</div>}
      {footer && <div className="mt-3 min-w-0">{footer}</div>}
    </section>
  );
};

export default GuidanceCard;
