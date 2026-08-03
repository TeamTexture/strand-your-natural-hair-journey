import { Lightbulb } from "lucide-react";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import TipsBlock from "@/components/tips/TipsBlock";
import AiProse from "@/components/tips/AiProse";
import LevelGate from "@/components/tips/LevelGate";
import { useGoalTip } from "@/hooks/useGoalTip";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { useSmartInline } from "@/lib/smartInline";
import type { UserGoal } from "@/hooks/useGoals";
import { type GuidanceTip } from "@/lib/tipsRender";

/**
 * "How you'll get there" — the goal-anchored guidance block.
 *
 * Same content contract as the Home goal card (goal-led grounded pipeline,
 * each tip = action + short why through her own signals, icon ActionRows,
 * word caps). The Journal asks for a deeper set: up to 5 actions at levels
 * 3–4, and the level cap in TipsBlock trims that to 3 at levels 1–2.
 */
const GoalTipsSection = ({ goal }: { goal: UserGoal }) => {
  const { level } = useTipsLevel();
  const renderRichText = useSmartInline();
  const { data: tip, isLoading } = useGoalTip(goal, { maxTips: level >= 3 ? 5 : 3 });

  return (
    <GuidanceCard
      tone="gold"
      compact={level <= 2}
      eyebrow="How you'll get there"
      icon={Lightbulb}
      headline={tip ? renderRichText(tip.headline) : undefined}
    >
      {tip ? (
        <>
          <LevelGate min={2}>
            <AiProse text={tip.body} />
          </LevelGate>
          {tip.actions?.length > 0 && (
            <TipsBlock
              idPrefix="journal-goaltip"
              dedupeAgainst={tip.body}
              reassurance="Small, steady steps beat big changes — you only need the first one today."
              tips={tip.actions.map((a, i): GuidanceTip => ({
                priority: tip.actions.length - i,
                short: typeof a === "string" ? a : a.action,
                why: typeof a === "string" ? undefined : a.why,
              }))}
            />
          )}
        </>
      ) : isLoading ? (
        <div className="flex items-center gap-2">
          <span className="block size-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
          <p className="text-xs text-muted-foreground italic">Working out your next steps…</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Your steps appear once your goal has a target to work towards.
        </p>
      )}
    </GuidanceCard>
  );
};

export default GoalTipsSection;
