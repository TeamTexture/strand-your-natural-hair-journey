import { useMemo } from "react";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { condenseProse, shortForm, selectTips, dedupeTips, type GuidanceTip } from "@/lib/tipsRender";
import { BeginnerSteps, DoDont, BeginnerReassurance } from "@/components/beginner/BeginnerGuide";
import { useSmartInline } from "@/lib/smartInline";
import { cn } from "@/lib/utils";

/**
 * The one component every page uses to render guidance.
 *
 * Level 1 — one top-priority tip, instruction only.
 * Level 2 — top three tips, short-form, no reasoning.
 * Level 3 — all tips with the "why".
 * Level 4 — illustrated numbered step cards, plain language, do/don't,
 *           inline definitions and closing reassurance.
 *
 * ONE THEME, ONCE — pass `dedupeAgainst` with the prose already shown above
 * this block (an AI overview, a card body) and any tip that merely restates it
 * is dropped before rendering.
 */
const TipsBlock = ({
  tips,
  dos,
  donts,
  reassurance,
  idPrefix = "tip",
  className,
  dedupeAgainst,
}: {
  tips: GuidanceTip[];
  /** Level-4-only correct-practice list for the whole block. */
  dos?: string[];
  /** Level-4-only incorrect-practice list for the whole block. */
  donts?: string[];
  reassurance?: string;
  idPrefix?: string;
  className?: string;
  /** Prose already visible on the same screen — duplicate tips are suppressed. */
  dedupeAgainst?: string | null;
}) => {
  const { level, showExplanations, showBeginnerHelp } = useTipsLevel();
  const renderTip = useSmartInline();
  const shown = useMemo(
    () => selectTips(dedupeTips(tips, dedupeAgainst), level),
    [tips, level, dedupeAgainst],
  );

  if (shown.length === 0) return null;

  if (showBeginnerHelp) {
    const allDos = [...(dos ?? []), ...shown.flatMap((t) => t.dos ?? [])];
    const allDonts = [...(donts ?? []), ...shown.flatMap((t) => t.donts ?? [])];
    return (
      <div className={className}>
        <BeginnerSteps
          key="beginner"
          steps={shown.map((t) => ({ text: t.short, detail: t.why, define: t.define }))}
        />
        {(allDos.length > 0 || allDonts.length > 0) && (
          <DoDont className="mt-3" dos={allDos} donts={allDonts} />
        )}
        <BeginnerReassurance>{reassurance}</BeginnerReassurance>
      </div>
    );
  }

  return (
    <ul
      key={level}
      className={cn("space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-300", className)}
    >
      {shown.map((t, i) => (
        <li key={`${idPrefix}-${i}`} className="flex gap-2 text-[12px] leading-snug">
          <span className="text-primary mt-0.5 shrink-0">•</span>
          <span className="flex-1">
            {renderTip(shortForm(t.short, level), `${idPrefix}-${i}`)}
            {showExplanations && t.why && (
              <span className="block text-[11px] text-muted-foreground mt-1">
                {renderTip(condenseProse(t.why, level), `${idPrefix}-why-${i}`)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
};

export default TipsBlock;
