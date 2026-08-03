import { Lightbulb, AlertTriangle } from "lucide-react";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import StatusCallout from "@/components/guidance/StatusCallout";
import KeyFactChips from "@/components/guidance/KeyFactChips";
import AiProse from "@/components/tips/AiProse";
import { useGoalTip } from "@/hooks/useGoalTip";
import type { UserGoal } from "@/hooks/useGoals";

/**
 * "How you'll get there" — the goal-anchored guidance block.
 *
 * Contract (supersedes the earlier multi-tip playbook for this surface):
 * exactly TWO blocks — ONE key overview of how she'll reach the goal through
 * her own characteristics, plus her signal chips, and ONE caution: the single
 * thing most likely to undermine it. Wash-day technique lives on the Wash Day
 * surfaces and is out of scope here.
 */
const GoalTipsSection = ({ goal }: { goal: UserGoal }) => {
  const { data: tip, isLoading } = useGoalTip(goal, { variant: "journal" });
  const signals = (tip?.signals ?? []).filter(Boolean);

  return (
    <GuidanceCard tone="gold" eyebrow="How you'll get there" icon={Lightbulb}>
      {tip?.overview ? (
        <div className="space-y-3">
          <AiProse text={tip.overview} />
          {signals.length > 0 && (
            <KeyFactChips facts={signals.map((label) => ({ label }))} />
          )}
          {tip.caution && (
            <StatusCallout tone="warning" icon={AlertTriangle} label="Watch out for">
              {tip.caution}
            </StatusCallout>
          )}
        </div>
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
