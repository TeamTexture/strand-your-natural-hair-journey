import { format } from "date-fns";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLogTreatmentStep } from "@/hooks/useTreatmentPlans";
import {
  addDays,
  daysBetween,
  fromDateKey,
  isDueOn,
  slotsFor,
  todayKey,
  type EntryRow,
  type ScheduleRow,
  type TreatmentSlot,
} from "@/lib/treatmentSchedule";

const INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The seven days of one plan week for one step, tappable to tick a day off.
 *
 * Nothing about adherence is stored: a tap writes (or removes) a row in
 * `treatment_plan_entries` and every count on every surface is still derived
 * from the schedule at read time.
 */
const WeekDayTicks = ({
  planId,
  row,
  startDate,
  weekStart,
  entries,
  disabled,
}: {
  planId: string;
  row: ScheduleRow;
  startDate: string;
  weekStart: string;
  entries: EntryRow[];
  disabled?: boolean;
}) => {
  const { log, undo } = useLogTreatmentStep();
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const entryFor = (key: string, slot: TreatmentSlot) =>
    entries.find(
      (e) => e.schedule_id === row.id && e.entry_date === key && e.time_of_day === slot,
    );

  const strip = (slot: TreatmentSlot) => (
    <div key={slot} className="space-y-1">
      {slotsFor(row.time_of_day).length > 1 && (
        <p className="font-body text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {slot === "morning" ? "Morning" : "Evening"}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        {days.map((key) => {
          const due = isDueOn(row, startDate, key);
          const ahead = daysBetween(today, key) > 0;
          const entry = entryFor(key, slot);
          const done = entry?.status === "completed";
          const skipped = entry?.status === "skipped";
          const tappable = due && !ahead && !disabled;

          return (
            <button
              key={key}
              type="button"
              disabled={!tappable}
              aria-label={`${format(fromDateKey(key), "EEE d MMM")}${done ? " — logged" : ""}`}
              onClick={() => {
                if (!tappable) return;
                if (entry && !entry.id.startsWith("optimistic-")) {
                  undo.mutate(
                    { entryId: entry.id },
                    { onError: () => toast.error("Couldn't undo that just now") },
                  );
                  return;
                }
                log.mutate(
                  { planId, scheduleId: row.id, slot, status: "completed", date: key },
                  { onError: () => toast.error("Couldn't log that just now") },
                );
              }}
              className={cn(
                "size-8 rounded-full flex items-center justify-center font-body text-[11px] transition-colors",
                !due
                  ? "bg-muted/40 text-muted-foreground/60"
                  : done
                    ? "bg-primary text-primary-foreground"
                    : skipped
                      ? "border border-border bg-muted/40 text-muted-foreground"
                      : ahead
                        ? "border border-border/70 bg-background text-muted-foreground"
                        : "border border-primary/50 bg-background text-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : INITIALS[fromDateKey(key).getDay()]}
            </button>
          );
        })}
      </div>
    </div>
  );

  return <div className="space-y-2">{slotsFor(row.time_of_day).map(strip)}</div>;
};

export default WeekDayTicks;
