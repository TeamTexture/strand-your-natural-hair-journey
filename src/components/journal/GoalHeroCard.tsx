import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { goalIcon, goalProgressPct, goalTitle, weeksBetween } from "@/lib/goalVisuals";
import { useGoalProgressUpdates } from "@/hooks/useGoalProgressUpdates";
import type { UserGoal } from "@/hooks/useGoals";
import { cn } from "@/lib/utils";

/** Circular progress arc for measurable goals. */
const ProgressArc = ({ pct }: { pct: number }) => {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-[68px] shrink-0" aria-label={`${pct}% of the way there`}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" className="stroke-border" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          className="stroke-primary transition-all"
          strokeDasharray={c}
          strokeDashoffset={c - (Math.min(Math.max(pct, 0), 100) / 100) * c}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-body font-semibold text-[15px]">
        {pct}%
      </span>
    </div>
  );
};

/** Milestone dots for goals with no measurable numbers — one per update. */
const MilestoneDots = ({ count }: { count: number }) => (
  <div className="flex items-center gap-1.5" aria-label={`${count} updates logged`}>
    {Array.from({ length: 5 }).map((_, i) => (
      <span
        key={i}
        className={cn(
          "size-2 rounded-full",
          i < Math.min(count, 5) ? "bg-primary" : "bg-primary/20",
        )}
      />
    ))}
  </div>
);

/**
 * The centrepiece of the Style Journal — the user's current goal.
 * Medallion icon, goal name, target chip, progress feel, week counter,
 * the latest progress update, and the two actions.
 */
const GoalHeroCard = ({
  goal,
  onUpdateProgress,
  onSetNewGoal,
  onEdit,
  onViewUpdates,
}: {
  goal: UserGoal;
  onUpdateProgress: () => void;
  onSetNewGoal: () => void;
  onEdit: () => void;
  onViewUpdates: () => void;
}) => {
  const Icon = goalIcon(goal);
  const pct = goalProgressPct(goal);
  const week = weeksBetween(goal.started_at ?? goal.created_at ?? null, null);
  const { updates, latest } = useGoalProgressUpdates(goal.id);
  const latestSnippet = latest?.body_text ?? latest?.transcription_text ?? null;

  return (
    <section className="relative overflow-hidden rounded-[18px] border border-primary/25 bg-gradient-to-br from-primary/12 via-card to-secondary/50 p-4">
      {/* Layered tint so the card reads as the page hero. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-8 size-32 rounded-full bg-primary/15 blur-2xl"
      />

      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold font-body text-primary">
          Current goal
        </p>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Edit goal"
          className="size-8 rounded-full hover:bg-primary/10 flex items-center justify-center text-muted-foreground hover:text-primary shrink-0"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>

      <div className="relative mt-2 flex items-start gap-3">
        <span className="size-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
          <Icon className="size-6 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[20px] leading-tight break-words">{goalTitle(goal)}</h2>
          {goal.target_text && (
            <span className="mt-1.5 inline-block text-[11px] font-body px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 max-w-full break-words">
              {goal.target_text}
            </span>
          )}
        </div>
        {pct != null && <ProgressArc pct={pct} />}
      </div>

      {(week || pct == null) && (
        <div className="relative mt-3 flex items-center justify-between gap-3">
          {week && (
            <p className="font-body text-[12px] text-muted-foreground">
              Week {week} of this goal
            </p>
          )}
          {pct == null && <MilestoneDots count={updates.length} />}
        </div>
      )}

      {latestSnippet && (
        <button
          type="button"
          onClick={onViewUpdates}
          className="relative mt-3 w-full text-left rounded-[12px] border border-border bg-background/70 p-3"
        >
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-body">
            Latest update
          </p>
          <p className="text-[13px] font-body leading-snug mt-0.5 line-clamp-3">{latestSnippet}</p>
          <span className="text-[11px] font-body text-primary mt-1 inline-block">View all</span>
        </button>
      )}

      <div className="relative mt-4 space-y-2">
        <Button variant="gold" size="pill" onClick={onUpdateProgress}>
          Update progress
        </Button>
        <Button variant="goldGhost" size="pill" onClick={onSetNewGoal}>
          Set new goal
        </Button>
      </div>
    </section>
  );
};

export default GoalHeroCard;
