import { useMemo } from "react";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { shortForm, selectTips, dedupeTips, type GuidanceTip } from "@/lib/tipsRender";
import { DoDont, BeginnerReassurance } from "@/components/beginner/BeginnerGuide";
import ActionList, { type GuidanceAction } from "@/components/guidance/ActionList";
import StepSequence from "@/components/guidance/StepSequence";
import StatusCallout from "@/components/guidance/StatusCallout";
import { guidanceIcon } from "@/lib/guidance";
import KeyFactChips from "@/components/guidance/KeyFactChips";
import { cn } from "@/lib/utils";

/**
 * The one component every page uses to render guidance.
 *
 * Design responds to the support level:
 *  1 Minimal      — a single compact StatusCallout: icon + one action line +
 *                   one key chip.
 *  2 Essentials   — 2–3 icon-led ActionRows with chips, no "why" prose.
 *  3 Guided       — all tips as ActionRows with the "why" supporting text.
 *  4 Hand-holding — a numbered StepSequence with everything visible at once,
 *                   plus do/don't pairs and closing reassurance. Nothing is
 *                   collapsed or deferred.
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
  const shown = useMemo(
    () => selectTips(dedupeTips(tips, dedupeAgainst), level),
    [tips, level, dedupeAgainst],
  );

  if (shown.length === 0) return null;

  // Level 4 — everything, as a fully visible numbered sequence.
  if (showBeginnerHelp) {
    const allDos = [...(dos ?? []), ...shown.flatMap((t) => t.dos ?? [])];
    const allDonts = [...(donts ?? []), ...shown.flatMap((t) => t.donts ?? [])];
    return (
      <div key={level} className={cn("space-y-3", className)}>
        <StepSequence
          steps={shown.map((t) => ({
            text: t.short,
            detail: [t.why, t.define].filter(Boolean).join(" "),
          }))}
        />
        <KeyFactChips text={shown.map((t) => `${t.short} ${t.why ?? ""}`).join(" ")} max={5} />
        {(allDos.length > 0 || allDonts.length > 0) && (
          <DoDont dos={allDos} donts={allDonts} />
        )}
        <BeginnerReassurance>{reassurance}</BeginnerReassurance>
      </div>
    );
  }

  // Level 1 — one compact callout, small footprint.
  if (level === 1) {
    const top = shown[0];
    const line = shortForm(top.short, level);
    return (
      <StatusCallout
        key={level}
        tone="gold"
        icon={guidanceIcon(top.short)}
        className={cn("animate-in fade-in-0 duration-300", className)}
        chips={<KeyFactChips text={`${top.short} ${top.why ?? ""}`} max={1} />}
      >
        {line}
      </StatusCallout>
    );
  }

  // Levels 2–3 — icon-led action rows; the "why" appears from level 3.
  const actions: GuidanceAction[] = shown.map((t) => ({
    action: shortForm(t.short, level),
    why: showExplanations ? t.why : undefined,
  }));

  return (
    <ActionList
      key={level}
      actions={actions}
      showWhy={showExplanations}
      showChips={level >= 2}
      idPrefix={idPrefix}
      className={cn("animate-in fade-in-0 duration-300", className)}
    />
  );
};

export default TipsBlock;
