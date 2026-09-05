// GOALS + CHALLENGES — one card, two rows. The member's own words.
// No categories, no length default, no measurement UI unless she has actually
// entered numbers.
//
// Lifted out of Home (Sept 2026) so the same card — with the same editing —
// lives on the "Goals & length" page reached from the Everything in STRAND
// directory. Content and behaviour are unchanged.
import { useState } from "react";
import SurfaceCard from "@/components/SurfaceCard";
import GoalEditorSheet from "@/components/GoalEditorSheet";
import ChallengesEditorSheet from "@/components/journal/ChallengesEditorSheet";
import { useGoals } from "@/hooks/useGoals";
import { useChallenges } from "@/hooks/useChallenges";

const GoalsChallengesCard = () => {
  const { goal } = useGoals();
  const { challenges } = useChallenges();
  const [goalEditorOpen, setGoalEditorOpen] = useState(false);
  const [challengesOpen, setChallengesOpen] = useState(false);

  return (
    <>
      <SurfaceCard data-tour="goals">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground truncate">
            Your hair care goals & challenges
          </p>
          {(goal || challenges.length > 0) && (
            <button
              onClick={() => setGoalEditorOpen(true)}
              className="text-xs uppercase tracking-[0.15em] text-primary font-medium shrink-0 ml-2"
            >
              Update
            </button>
          )}
        </div>

        {goal ? (
          (() => {
            const title = goal.title?.trim();
            const heading =
              title && title.toLowerCase() !== "hair goal" ? title : "Your goal";
            const targetDate = goal.target_date
              ? new Date(goal.target_date).toLocaleDateString("en-GB", {
                  month: "short",
                  year: "numeric",
                })
              : null;
            const secondary =
              [goal.target_text?.trim() || null, targetDate ? `By ${targetDate}` : null]
                .filter(Boolean)
                .join(" · ") || null;
            // Numeric progress ONLY when she has entered every number herself
            // and named her own unit. Never a default unit.
            const unit = (goal.unit ?? "").trim();
            const start = goal.start_value;
            const current = goal.current_value;
            const target = goal.target_value;
            const hasNumbers =
              !!unit &&
              start != null &&
              current != null &&
              target != null &&
              target > start;
            const pct = hasNumbers
              ? Math.min(100, Math.max(0, ((current! - start!) / (target! - start!)) * 100))
              : null;
            return (
              <button onClick={() => setGoalEditorOpen(true)} className="w-full text-left">
                <p className="font-display text-base font-semibold leading-snug break-words">
                  {heading}
                </p>
                {secondary && (
                  <p className="text-xs text-muted-foreground mt-1 break-words">{secondary}</p>
                )}
                {pct != null && (
                  <>
                    <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {current} / {target} {unit}
                    </p>
                  </>
                )}
              </button>
            );
          })()
        ) : (
          <div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              What are you working towards? In your own words — there's no list to pick from.
            </p>
            <button
              onClick={() => setGoalEditorOpen(true)}
              className="mt-3 w-full rounded-pill bg-primary text-primary-foreground text-sm font-medium py-2.5"
            >
              Add your goals
            </button>
          </div>
        )}

        {/* Subtle divider between goal and challenges within the same card */}
        {(goal || challenges.length > 0) && (
          <div className="my-3 h-px w-full bg-border/60" />
        )}

        {challenges.length > 0 ? (
          <button
            onClick={() => setChallengesOpen(true)}
            className="w-full text-left flex flex-wrap gap-1.5"
          >
            {challenges.map((label) => (
              <span
                key={label}
                className="inline-flex items-center rounded-pill border border-primary/30 bg-primary/10 px-3 py-1 text-[11.5px] font-body text-foreground break-words"
              >
                {label}
              </span>
            ))}
          </button>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              What's getting in the way right now?
            </p>
            <button
              onClick={() => setChallengesOpen(true)}
              className="mt-3 w-full rounded-pill bg-primary text-primary-foreground text-sm font-medium py-2.5"
            >
              Add your challenges
            </button>
          </div>
        )}
      </SurfaceCard>

      <GoalEditorSheet open={goalEditorOpen} onOpenChange={setGoalEditorOpen} />
      <ChallengesEditorSheet open={challengesOpen} onOpenChange={setChallengesOpen} />
    </>
  );
};

export default GoalsChallengesCard;
