import { Sparkles } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { cn } from "@/lib/utils";
import {
  streakDays,
  streakStats,
  todayKey,
  type EntryRow,
} from "@/lib/treatmentSchedule";

/**
 * THE RUN — the fuller streak, and the only place it appears in full. Home
 * shows the light version after a tick; this is the record.
 *
 * Deliberate design rules, because this is a hair treatment and not a game:
 * nothing here is red, nothing breaks, nothing is lost. A single missed day is
 * forgiven outright and drawn as a neutral block with the run stated as intact.
 * Stopping a treatment is sometimes the right thing to do, and this card must
 * never make that feel like a failure.
 */
const PlanStreakCard = ({ entries }: { entries: EntryRow[] }) => {
  const today = todayKey();
  const stats = streakStats(entries, today);
  const chain = streakDays(entries, 14, today);
  const lit = stats.current > 0;

  return (
    <SurfaceCard className="space-y-3">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 size-9 rounded-full flex items-center justify-center shrink-0",
            lit ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Sparkles className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-body text-[10px] uppercase tracking-[0.18em] text-primary">
            Your run
          </p>
          <p className="font-display text-[19px] leading-tight mt-0.5">
            {lit
              ? `${stats.current} day${stats.current === 1 ? "" : "s"} in a row`
              : "Your run starts with the next step you log"}
          </p>
          {stats.best > 0 && (
            <p className="font-body text-[11.5px] text-muted-foreground mt-0.5">
              Best run so far · {stats.best} day{stats.best === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </div>

      {/* the last fortnight, unbroken — the grace day reads as neutral, not lost */}
      <div className="flex items-end gap-[3px]">
        {chain.map((d) => {
          const grace = d.key === stats.graceKey;
          return (
            <span
              key={d.key}
              aria-hidden
              className={cn(
                "h-6 flex-1 rounded-[3px] border",
                grace
                  ? "border-border bg-secondary"
                  : d.state === "complete"
                    ? "border-primary bg-primary"
                    : d.state === "partial"
                      ? "border-primary/40 bg-primary/25"
                      : "border-border/70 bg-muted/40",
                d.isToday && "ring-1 ring-primary/40 ring-offset-1 ring-offset-background",
              )}
            />
          );
        })}
      </div>
      <p className="font-body text-[11px] text-muted-foreground">The last 14 days</p>

      {stats.graceKey && (
        <p className="font-body text-[12px] text-muted-foreground leading-snug">
          You missed one day — your run is still intact. One day off never resets it.
        </p>
      )}

      {stats.nextMilestone && (
        <div className="rounded-[12px] border border-border/70 bg-background/60 px-3 py-2">
          <p className="font-body text-[12.5px] leading-snug">
            <span className="font-semibold">{stats.toMilestone} more day
            {stats.toMilestone === 1 ? "" : "s"}</span> to a {stats.nextMilestone}-day run.
          </p>
          <div className="mt-1.5 h-1.5 w-full rounded-pill bg-muted overflow-hidden">
            <div
              className="h-full rounded-pill bg-primary transition-all"
              style={{
                width: `${Math.min(100, Math.round((stats.current / stats.nextMilestone) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}
    </SurfaceCard>
  );
};

export default PlanStreakCard;
