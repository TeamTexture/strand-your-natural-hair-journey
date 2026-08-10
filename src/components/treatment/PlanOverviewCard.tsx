import { Sparkles, Target } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { useChallenges } from "@/hooks/useChallenges";
import { cadenceSummary, type ScheduleRow } from "@/lib/treatmentSchedule";

interface Props {
  goal: string | null;
  schedule: ScheduleRow[];
  startDate: string;
}

/**
 * ONE card at the top of a plan: what she's hoping for, what she's up against,
 * and the shape of the treatment itself. Everything she needs to remember why
 * she started, without scrolling.
 */
const PlanOverviewCard = ({ goal, schedule, startDate }: Props) => {
  const { challenges } = useChallenges();
  const steps = [...schedule].sort((a, b) => a.step_order - b.step_order);

  if (!goal && challenges.length === 0 && steps.length === 0) return null;

  return (
    <SurfaceCard tone="gold" className="space-y-3">
      {goal && (
        <div>
          <SectionLabel className="px-0 mt-0 mb-1.5">What you're hoping for</SectionLabel>
          <p className="font-body text-[14px] leading-snug [overflow-wrap:anywhere]">{goal}</p>
        </div>
      )}

      {challenges.length > 0 && (
        <div className={goal ? "pt-3 border-t border-border/60" : ""}>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5 flex items-center gap-1.5">
            <Target className="size-3" /> What you're working against
          </p>
          <div className="flex flex-wrap gap-1.5">
            {challenges.map((c) => (
              <span
                key={c}
                className="rounded-pill bg-card/70 border border-border px-2.5 py-1 font-body text-[12px] break-words"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <div className={goal || challenges.length > 0 ? "pt-3 border-t border-border/60" : ""}>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body mb-1.5 flex items-center gap-1.5">
            <Sparkles className="size-3" /> The treatment, in short
          </p>
          <ul className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-start gap-2.5 min-w-0">
                <span className="mt-0.5 size-5 rounded-full bg-card/70 border border-border flex items-center justify-center shrink-0 font-body text-[10px]">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-body text-[13px] font-semibold break-words">{s.task_name}</p>
                  <p className="font-body text-[11px] text-muted-foreground">
                    {cadenceSummary(s, startDate)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SurfaceCard>
  );
};

export default PlanOverviewCard;
