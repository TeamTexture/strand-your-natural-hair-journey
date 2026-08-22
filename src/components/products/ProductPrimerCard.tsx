import { Sparkles, Droplets, Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import { MARKETED_PURPOSE_LABEL, type MarketedPurpose } from "@/lib/marketedPurpose";
import { splitNumberedSteps } from "@/lib/guidance";

interface Props {
  /** Product name / brand — the "what it is" anchor. */
  title?: string | null;
  /** Detected marketed purpose (what it's sold to do). */
  purpose?: MarketedPurpose | null;
  /** One or two plain sentences: what it is and what it does for her hair. */
  note?: string | null;
  /** Manufacturer directions, verbatim. Condensed to the essential steps here. */
  usage?: string | null;
  className?: string;
}

/** Trim manufacturer directions down to a short, scannable summary. */
function condenseUsage(usage: string): string[] {
  const steps = splitNumberedSteps(usage);
  const parts = (steps.length > 1 ? steps : usage.split(/(?<=[.!])\s+/))
    .map((s) => s.replace(/^\s*[\d]+[.)]\s*/, "").trim())
    .filter((s) => s.length > 2);
  return parts.slice(0, 3);
}

/**
 * The orientation box that sits directly above the hair verdict: what this
 * product is, what it does, and how to use it — before any scoring.
 */
const ProductPrimerCard = ({ title, purpose, note, usage, className }: Props) => {
  const steps = usage?.trim() ? condenseUsage(usage) : [];
  if (!note?.trim() && !purpose && steps.length === 0) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[16px] border border-primary/35",
        "bg-gradient-to-br from-primary/[0.14] via-card to-card",
        "shadow-[0_6px_18px_-12px_hsl(var(--primary)/0.55)]",
        className,
      )}
    >
      {/* gold spine */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-primary/70" />

      <div className="p-4 pl-5 space-y-3 min-w-0">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-primary shrink-0" />
          <p className="font-body text-[10px] uppercase tracking-[0.2em] text-primary whitespace-nowrap">
            What this is
          </p>
        </div>

        {title?.trim() && (
          <p className="font-display text-[17px] leading-tight text-foreground">{title.trim()}</p>
        )}

        {purpose && (
          <span className="inline-flex items-center rounded-pill border border-primary/30 bg-primary/10 px-2.5 py-[3px] font-body text-[10px] uppercase tracking-[0.14em] text-foreground/80">
            Sold for {MARKETED_PURPOSE_LABEL[purpose]}
          </span>
        )}

        {note?.trim() && (
          <div className="flex gap-2">
            <Droplets className="size-3.5 mt-[3px] text-primary/70 shrink-0" />
            <p className="font-body text-[13px] leading-[1.5] text-foreground/85">{note.trim()}</p>
          </div>
        )}

        {steps.length > 0 && (
          <div className="pt-3 border-t border-primary/20 space-y-2">
            <div className="flex items-center gap-2">
              <Hand className="size-3.5 text-primary shrink-0" />
              <p className="font-body text-[10px] uppercase tracking-[0.2em] text-primary whitespace-nowrap">
                How to use it
              </p>
            </div>
            <ol className="space-y-1.5">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2 min-w-0">
                  <span className="mt-[2px] flex size-[16px] shrink-0 items-center justify-center rounded-full bg-primary/15 font-body text-[9px] font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="font-body text-[12.5px] leading-[1.45] text-foreground/80">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductPrimerCard;
