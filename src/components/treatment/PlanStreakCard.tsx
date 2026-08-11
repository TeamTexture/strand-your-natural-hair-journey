import { Check, Flame, Trophy } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { cn } from "@/lib/utils";
import {
  runChain,
  streakStats,
  todayKey,
  type EntryRow,
} from "@/lib/treatmentSchedule";

/**
 * THE RUN — the fuller streak, and the only place it appears in full. Home
 * shows the light version after a tick; this is the record.
 *
 * Read direction matters: the chain is anchored on the day the run STARTED and
 * fills LEFT TO RIGHT, so day one is always the leftmost bead and the days still
 * to come sit empty on the right. Each logged day carries a tick, so it reads as
 * an achievement rather than an anonymous dot, and the milestone slot is flagged
 * with a trophy so there is something visible to run at.
 *
 * Deliberate design rules, because this is a hair treatment and not a game:
 * nothing here is red, nothing breaks, nothing is lost. A single missed day is
 * forgiven outright and drawn as a neutral bead with the run stated as intact.
 */
const PlanStreakCard = ({ entries }: { entries: EntryRow[] }) => {
  const today = todayKey();
  const stats = streakStats(entries, today);
  const chain = runChain(entries, today);
  const lit = stats.current > 0;
  const pct = stats.nextMilestone
    ? Math.min(100, Math.round((stats.current / stats.nextMilestone) * 100))
    : 100;

  return (
    <SurfaceCard className="space-y-3.5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 size-11 rounded-full flex items-center justify-center shrink-0 relative",
            lit
              ? "bg-primary/15 text-primary ring-1 ring-primary/25"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Flame className="size-5" strokeWidth={1.75} />
          {lit && (
            <span className="absolute -bottom-1 -right-1 min-w-5 h-5 px-1 rounded-pill bg-primary text-primary-foreground font-body text-[11px] font-semibold flex items-center justify-center">
              {stats.current}
            </span>
          )}
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

      {/* the run itself — day one on the left, days to come on the right */}
      <div>
        <div className="flex items-end gap-[5px]">
          {chain.map((d) => {
            const done = !d.future && d.state === "complete";
            const part = !d.future && d.state === "partial";
            return (
              <div key={d.key} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                {d.milestone ? (
                  <Trophy
                    className={cn(
                      "size-3 shrink-0",
                      stats.current >= d.milestone ? "text-primary" : "text-muted-foreground/50",
                    )}
                    strokeWidth={2}
                  />
                ) : (
                  <span aria-hidden className="h-3" />
                )}
                <span
                  className={cn(
                    "w-full aspect-square max-h-8 rounded-[9px] border flex items-center justify-center transition-all",
                    d.grace
                      ? "border-border bg-secondary"
                      : done
                        ? "border-primary bg-primary text-primary-foreground"
                        : part
                          ? "border-primary/50 bg-primary/25 text-primary"
                          : "border-border/70 bg-muted/40",
                    d.isToday && "ring-2 ring-primary/35 ring-offset-1 ring-offset-background",
                  )}
                >
                  {done || part ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>
                <span
                  className={cn(
                    "font-body text-[9px] leading-none",
                    done ? "text-primary font-semibold" : "text-muted-foreground",
                  )}
                >
                  {d.index}
                </span>
              </div>
            );
          })}
        </div>
        <p className="font-body text-[11px] text-muted-foreground mt-2">
          {lit
            ? `Day one on the left · you're on day ${stats.current}`
            : "Log a step today and the first day lights up here."}
        </p>
      </div>

      {stats.graceKey && (
        <p className="font-body text-[12px] text-muted-foreground leading-snug">
          You missed one day — your run is still intact. One day off never resets it.
        </p>
      )}

      {stats.nextMilestone && (
        <div className="rounded-[12px] border border-border/70 bg-background/60 px-3 py-2">
          <p className="font-body text-[12.5px] leading-snug flex items-center gap-1.5">
            <Trophy className="size-3.5 shrink-0 text-primary" strokeWidth={2} />
            <span>
              <span className="font-semibold">
                {stats.toMilestone} more day{stats.toMilestone === 1 ? "" : "s"}
              </span>{" "}
              to a {stats.nextMilestone}-day run.
            </span>
          </p>
          <div className="mt-1.5 h-1.5 w-full rounded-pill bg-muted overflow-hidden">
            <div
              className="h-full rounded-pill bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </SurfaceCard>
  );
};

export default PlanStreakCard;
