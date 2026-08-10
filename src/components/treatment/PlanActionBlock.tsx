import { useState } from "react";
import { format } from "date-fns";
import { Camera, ClipboardCheck, History } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CatchUpDays from "@/components/treatment/CatchUpDays";
import type { PlanBundle } from "@/hooks/useTreatmentPlans";
import {
  addDays,
  cycleConsistencyLine,
  cycleState,
  daysBetween,
  dueSlotsOn,
  fromDateKey,
  todayKey,
  weekNumberFor,
  weekRange,
  type CheckinCycle,
} from "@/lib/treatmentSchedule";

interface Props {
  bundle: PlanBundle;
  cycles: CheckinCycle[];
  /** Closing weeks that already have a submitted check-in. */
  savedWeeks: Set<number>;
  milestoneWeeks: number[];
  onCheckin: (week: number) => void;
  /** Read-only when STRAND+ has lapsed or the plan is paused. */
  disabled?: boolean;
}

/**
 * THE ONE THING TO DO — a single block that shows exactly one action, or none.
 *
 * Priority: an open check-in, then days missing from this week, then nothing —
 * and "nothing" is a quiet recessive card, never a call to action. A check-in
 * can only ever be offered once its cycle has closed; you cannot reflect on a
 * fortnight on its first morning.
 */
const PlanActionBlock = ({
  bundle,
  cycles,
  savedWeeks,
  milestoneWeeks,
  onCheckin,
  disabled,
}: Props) => {
  const { plan, schedule, entries } = bundle;
  const today = todayKey();
  const [catchUp, setCatchUp] = useState(false);

  const open = cycles.find(
    (c) => cycleState(c, cycles, savedWeeks.has(c.closingWeek), today) === "open",
  );

  // Days in the current week that expected something and were never logged.
  // Today is left alone — it isn't missed until it's over.
  const currentWeek = Math.max(
    1,
    Math.min(plan.duration_weeks, weekNumberFor(plan.start_date, today)),
  );
  const { start } = weekRange(plan.start_date, currentWeek);
  let missingDays = 0;
  for (let key = start; daysBetween(key, today) > 0; key = addDays(key, 1)) {
    const due = dueSlotsOn(schedule, plan.start_date, key);
    if (!due.length) continue;
    const anyLogged = due.some(({ row, slot }) =>
      entries.some(
        (e) => e.schedule_id === row.id && e.entry_date === key && e.time_of_day === slot,
      ),
    );
    if (!anyLogged) missingDays += 1;
  }

  const nextOpen = cycles.find(
    (c) => cycleState(c, cycles, savedWeeks.has(c.closingWeek), today) === "not_open",
  );
  const loggedToday = entries.filter((e) => e.entry_date === today).length;
  const dueToday = dueSlotsOn(schedule, plan.start_date, today).length;

  /* 1 — a check-in has opened. The one loud thing on the page. */
  if (open) {
    return (
      <SurfaceCard className="bg-primary border-primary text-primary-foreground space-y-2.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-body text-[10px] uppercase tracking-[0.18em] text-primary-foreground/75">
              Cycle {open.cycle} of {cycles.length} is ready
            </p>
            <p className="font-display text-[21px] leading-tight mt-0.5">
              How did these {open.closingWeek - open.startWeek + 1 === 1 ? "week" : "weeks"} go?
            </p>
            <p className="font-body text-[11.5px] text-primary-foreground/85 mt-0.5">
              {format(fromDateKey(open.start), "d MMM")} –{" "}
              {format(fromDateKey(open.end), "d MMM")}
            </p>
          </div>
          {milestoneWeeks.includes(open.closingWeek) && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-pill bg-background/25 px-2.5 py-1 font-body text-[10px] font-semibold uppercase tracking-[0.12em]">
              <Camera className="size-3" /> Photo
            </span>
          )}
        </div>

        <p className="font-body text-[13px] leading-snug text-primary-foreground/90">
          {cycleConsistencyLine(schedule, entries, plan.start_date, open, today)}
        </p>

        <Button
          className="rounded-pill w-full bg-background text-primary hover:bg-background/90"
          onClick={() => onCheckin(open.closingWeek)}
        >
          <ClipboardCheck className="size-4 mr-1.5" />
          {disabled ? "Read check-in" : "Start check-in"}
        </Button>
      </SurfaceCard>
    );
  }

  /* 2 — days missing from this week. Filling them in is the only ask. */
  if (missingDays > 0 && !disabled) {
    return (
      <>
        <SurfaceCard className="space-y-2">
          <p className="font-display text-[17px] leading-snug">
            Catch up on {missingDays} missed day{missingDays === 1 ? "" : "s"}
          </p>
          <p className="font-body text-[12.5px] text-muted-foreground leading-snug">
            Logging them now still counts — nothing is held against you.
          </p>
          <Button variant="outline" className="rounded-pill w-full" onClick={() => setCatchUp(true)}>
            <History className="size-4 mr-1.5" /> Fill in those days
          </Button>
        </SurfaceCard>

        <Dialog open={catchUp} onOpenChange={setCatchUp}>
          <DialogContent className="max-w-[330px] rounded-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-[19px]">Log a day you missed</DialogTitle>
              <DialogDescription className="font-body text-[12.5px]">
                Logging it now still counts — nothing is held against you.
              </DialogDescription>
            </DialogHeader>
            <CatchUpDays bundle={bundle} disabled={disabled} />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  /* 3 — nothing outstanding. Quiet, recessive, no button. */
  return (
    <div className="rounded-[16px] border border-border/60 bg-secondary/50 px-4 py-3.5">
      <p className="font-body text-[13px] text-muted-foreground leading-snug">
        {dueToday === 0
          ? "Nothing due today."
          : loggedToday >= dueToday
            ? "Today is logged. Nothing else outstanding."
            : "Today's steps are on your home screen when you're ready."}
      </p>
      <p className="font-body text-[12px] text-muted-foreground leading-snug mt-1">
        {nextOpen
          ? `Your next check-in opens ${format(fromDateKey(nextOpen.opensOn), "EEE d MMM")}.`
          : "Every check-in for this plan is written up."}
      </p>
    </div>
  );
};

export default PlanActionBlock;
