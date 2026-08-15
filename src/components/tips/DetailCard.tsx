import { ReactNode } from "react";
import { Info } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { condenseProse } from "@/lib/tipsRender";
import { plainLanguage, pickTipIcon } from "@/components/beginner/BeginnerGuide";
import { cn } from "@/lib/utils";
import { capitaliseSentences } from "@/lib/paragraphs";

/**
 * Level-aware detail card — the shared shape for ingredient cards, blood
 * marker cards, supplement cards and anything else that is
 * "name + what it is + what it means for you + what to do".
 *
 * Level 1 — name, status chip and the one-line relevance.
 * Level 2 — adds the condensed "what it is".
 * Level 3 — full text, plus any extra children (diet ideas, sources…).
 * Level 3 (Hand-holding) — plain-English, icon-led, with an explicit "What to do" line.
 */
const DetailCard = ({
  title,
  chip,
  /** One line: why this matters to this user. Shown at every level. */
  relevance,
  /** Neutral description of the thing itself. Level 2+. */
  what,
  /** The recommended action. Always shown when provided. */
  action,
  /** Full supporting detail — diet ideas, sources, caveats. Level 3+. */
  children,
  tone = "card",
  className,
  onClick,
}: {
  title: string;
  chip?: ReactNode;
  relevance?: string | null;
  what?: string | null;
  action?: string | null;
  children?: ReactNode;
  tone?: "card" | "gold" | "dark" | "green" | "orange";
  className?: string;
  onClick?: () => void;
}) => {
  const { level } = useTipsLevel();
  const beginner = level >= 3;
  const Icon = pickTipIcon(action ?? relevance ?? title);
  const say = (t?: string | null) =>
    capitaliseSentences(beginner ? plainLanguage(condenseProse(t, level)) : condenseProse(t, level));

  return (
    <SurfaceCard
      tone={tone}
      className={cn(onClick && "cursor-pointer", className)}
      onClick={onClick}
      key={level}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={cn("font-display text-foreground leading-tight min-w-0 [overflow-wrap:anywhere]", beginner ? "text-[17px]" : "text-[15px]")}>
          {title}
        </p>
        {chip}
      </div>

      {relevance && (
        <p className={cn("mt-1.5 leading-[1.6] text-foreground/85 [overflow-wrap:anywhere]", beginner ? "text-[13.5px]" : "text-[12.5px]")}>
          {say(relevance)}
        </p>
      )}

      {what && level >= 2 && (
        <p className={cn("mt-1.5 leading-[1.6] text-muted-foreground [overflow-wrap:anywhere]", beginner ? "text-[13px]" : "text-[11.5px]")}>
          {say(what)}
        </p>
      )}

      {action && (
        <div
          className={cn(
            "mt-2.5 flex items-start gap-2 rounded-[12px]",
            beginner ? "bg-primary/10 p-3" : "",
          )}
        >
          {beginner && (
            <span className="size-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Icon className="size-4 text-primary" />
            </span>
          )}
          <div className="flex-1 min-w-0">
            {beginner && (
              <p className="text-[10px] uppercase tracking-[0.16em] text-primary font-semibold mb-0.5">
                What to do
              </p>
            )}
            <p className={cn("leading-[1.6] text-foreground/90 [overflow-wrap:anywhere]", beginner ? "text-[13.5px]" : "text-[12px]")}>
              {say(action)}
            </p>
          </div>
        </div>
      )}

      {level >= 3 && children}

      {beginner && (
        <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted-foreground">
          <Info className="size-3.5 text-primary shrink-0 mt-[1px]" />
          <span>Small, steady changes are enough. You do not need to do everything at once.</span>
        </p>
      )}
    </SurfaceCard>
  );
};

export default DetailCard;
