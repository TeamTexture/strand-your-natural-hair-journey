import { Heart, Sparkles, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { useChallenges } from "@/hooks/useChallenges";
import { cadenceSummary, type ScheduleRow } from "@/lib/treatmentSchedule";

interface Props {
  goal: string | null;
  schedule: ScheduleRow[];
  startDate: string;
}

/** One label treatment for every block in this card, so the three read as a set. */
const BlockLabel = ({ icon: Icon, children }: { icon: LucideIcon; children: string }) => (
  <p className="flex items-center gap-2 font-body text-[10px] uppercase tracking-[0.2em] text-primary">
    <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
    <span className="min-w-0 break-words">{children}</span>
  </p>
);

/**
 * ONE card at the top of a plan: what she's hoping for, what she's up against,
 * and the shape of the treatment itself. Everything she needs to remember why
 * she started, without scrolling.
 */
const PlanOverviewCard = ({ goal, schedule, startDate }: Props) => {
  const { challenges } = useChallenges();
  const steps = [...schedule].sort((a, b) => a.step_order - b.step_order);

  const blocks: { key: string; icon: LucideIcon; label: string; body: JSX.Element }[] = [];

  if (goal) {
    blocks.push({
      key: "goal",
      icon: Heart,
      label: "What you're hoping for",
      body: (
        <p className="font-display text-[19px] leading-tight [overflow-wrap:anywhere]">{goal}</p>
      ),
    });
  }

  if (challenges.length > 0) {
    blocks.push({
      key: "challenges",
      icon: Target,
      label: "What you're working against",
      body: (
        <div className="flex flex-wrap gap-1.5">
          {challenges.map((c) => (
            <span
              key={c}
              className="rounded-pill bg-card/80 border border-border/70 px-3 py-1 font-body text-[12px] leading-snug break-words"
            >
              {c}
            </span>
          ))}
        </div>
      ),
    });
  }

  if (steps.length > 0) {
    blocks.push({
      key: "steps",
      icon: Sparkles,
      label: "The treatment, in short",
      body: (
        <ul className="space-y-2.5">
          {steps.map((s, i) => (
            <li key={s.id} className="flex items-start gap-3 min-w-0">
              <span className="mt-[1px] size-6 rounded-full bg-card/80 border border-border/70 flex items-center justify-center shrink-0 font-display text-[11px] leading-none text-primary">
                {i + 1}
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="font-body text-[13.5px] font-medium leading-snug break-words">
                  {s.task_name}
                </p>
                <p className="font-body text-[11px] text-muted-foreground leading-snug">
                  {cadenceSummary(s, startDate)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ),
    });
  }

  if (blocks.length === 0) return null;

  return (
    <SurfaceCard tone="gold" className="p-0 overflow-hidden">
      {blocks.map((b, i) => (
        <div
          key={b.key}
          className={i > 0 ? "px-4 py-3.5 border-t border-border/50" : "px-4 py-3.5"}
        >
          <BlockLabel icon={b.icon}>{b.label}</BlockLabel>
          <div className="mt-2 pl-[22px]">{b.body}</div>
        </div>
      ))}
    </SurfaceCard>
  );
};

export default PlanOverviewCard;
