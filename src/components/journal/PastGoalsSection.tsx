import SectionLabel from "@/components/SectionLabel";
import { goalDateRange, goalDuration, goalIcon, goalTitle } from "@/lib/goalVisuals";
import type { UserGoal } from "@/hooks/useGoals";

/** Compact archive rows — nothing gets wiped, every finished goal stays here. */
const PastGoalsSection = ({
  goals,
  onOpen,
}: {
  goals: UserGoal[];
  onOpen: (goal: UserGoal) => void;
}) => {
  if (goals.length === 0) return null;
  return (
    <>
      <SectionLabel>Past goals</SectionLabel>
      <div className="px-5 pb-6 space-y-2">
        {goals.map((g) => {
          const Icon = goalIcon(g);
          const range = goalDateRange(g.started_at, g.ended_at);
          const duration = goalDuration(g.started_at, g.ended_at);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onOpen(g)}
              className="w-full text-left rounded-[12px] border border-border bg-card p-3 flex items-start gap-3 hover:border-primary/50 transition-colors"
            >
              <span className="size-9 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0">
                <Icon className="size-4 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-body text-[13px] font-medium leading-snug break-words">
                  {goalTitle(g)}
                </span>
                {g.target_text && (
                  <span className="block text-[11px] font-body text-muted-foreground leading-snug break-words mt-0.5">
                    {g.target_text}
                  </span>
                )}
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {range && (
                    <span className="text-[10px] font-body px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      {range}
                    </span>
                  )}
                  {duration && (
                    <span className="text-[10px] font-body px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {duration}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
};

export default PastGoalsSection;
