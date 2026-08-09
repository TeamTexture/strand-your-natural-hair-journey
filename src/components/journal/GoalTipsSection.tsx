import { Lightbulb } from "lucide-react";
import GuidanceCard from "@/components/guidance/GuidanceCard";
import AiProse from "@/components/tips/AiProse";
import { useGoalTip, type GoalTipStep } from "@/hooks/useGoalTip";
import { useTipsLevel } from "@/hooks/useTipsLevel";
import { displayForLevel, isRenderableTip } from "@/lib/tipDisplay";
import type { UserGoal } from "@/hooks/useGoals";

/**
 * "How you'll get there" — the goal-anchored guidance block.
 *
 * Every step is a tip on the SHARED TIP CONTRACT: headline + action + reason
 * (+ extended at hand-holding). The support level controls display only.
 *
 * NON-RENDER ASSERTION: a step without both an action and a reason never
 * renders its normal layout. If no step qualifies we show a brief preparing
 * state with a retry — never a bare headline, and never an empty state on a
 * goal that has a target (numeric OR described in her own words).
 */
const GoalTipsSection = ({ goal }: { goal: UserGoal }) => {
  const { data: tip, isLoading, isFetching, refetch } = useGoalTip(goal, {
    variant: "journal",
  });
  const { level } = useTipsLevel();

  const steps: GoalTipStep[] = (tip?.steps ?? [])
    .filter(isRenderableTip)
    .map((s) => displayForLevel(s, level));

  return (
    <GuidanceCard tone="gold" eyebrow="How you'll get there" icon={Lightbulb}>
      {steps.length > 0 ? (
        <ol className="space-y-4">
          {steps.map((step, i) => (
            <li key={i} className="space-y-1.5">
              {step.headline && (
                <p className="text-[13px] font-medium leading-snug text-foreground">
                  {step.headline}
                </p>
              )}
              <AiProse text={step.action ?? ""} />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {step.reason}
              </p>
              {step.extended && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {step.extended}
                </p>
              )}
            </li>
          ))}
        </ol>
      ) : isLoading || isFetching ? (
        <div className="flex items-center gap-2">
          <span
            className="block size-2 rounded-full bg-primary animate-pulse"
            aria-hidden="true"
          />
          <p className="text-xs text-muted-foreground italic">
            Working out your next steps…
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground italic">
            Your steps are being prepared.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-xs uppercase tracking-[0.15em] text-primary font-medium"
          >
            Try again
          </button>
        </div>
      )}
    </GuidanceCard>
  );
};

export default GoalTipsSection;
