import { useState } from "react";
import { format } from "date-fns";
import { Check, Undo2 } from "lucide-react";
import { toast } from "sonner";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLogTreatmentStep, type PlanBundle } from "@/hooks/useTreatmentPlans";
import {
  addDays,
  daysBetween,
  dueSlotsOn,
  fromDateKey,
  todayKey,
  type EntryRow,
} from "@/lib/treatmentSchedule";

const WINDOW = 14;

const dayLabel = (key: string, today: string) => {
  const diff = daysBetween(key, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return format(fromDateKey(key), "EEE d MMM");
};

/**
 * Retrospective logging. The past fortnight, day by day, so a missed evening
 * can still be recorded honestly instead of counting against her forever.
 * Future days never appear.
 */
const CatchUpDays = ({ bundle, disabled }: { bundle: PlanBundle; disabled?: boolean }) => {
  const { plan, schedule, entries } = bundle;
  const { log, undo } = useLogTreatmentStep();
  const [expanded, setExpanded] = useState(false);
  const today = todayKey();

  const days: string[] = [];
  for (let i = 0; i < WINDOW; i += 1) {
    const key = addDays(today, -i);
    if (daysBetween(plan.start_date, key) < 0) break;
    if (dueSlotsOn(schedule, plan.start_date, key).length) days.push(key);
  }
  if (!days.length) return null;

  const shown = expanded ? days : days.slice(0, 3);

  const entryFor = (scheduleId: string, key: string, slot: "morning" | "evening") =>
    entries.find(
      (e: EntryRow) =>
        e.schedule_id === scheduleId && e.entry_date === key && e.time_of_day === slot,
    );

  return (
    <div className="space-y-2">
      <SectionLabel className="px-0 mt-0 mb-1.5">Catch up on a missed day</SectionLabel>
      <div className="space-y-1.5">
        {shown.map((key) => {
          const due = dueSlotsOn(schedule, plan.start_date, key);
          const doneCount = due.filter(({ row, slot }) => entryFor(row.id, key, slot)?.status === "completed").length;
          return (
            <SurfaceCard key={key} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-body text-[14px] font-semibold">{dayLabel(key, today)}</p>
                <p className="font-body text-[11px] text-muted-foreground">
                  {doneCount} of {due.length} logged
                </p>
              </div>
              <div className="space-y-1.5">
                {due.map(({ row, slot }) => {
                  const entry = entryFor(row.id, key, slot);
                  const done = entry?.status === "completed";
                  const skipped = entry?.status === "skipped";
                  return (
                    <div key={`${row.id}:${slot}`} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-body text-[13px] leading-snug [overflow-wrap:anywhere]">
                          {row.task_name}
                        </p>
                        <p className="font-body text-[11px] text-muted-foreground">
                          {slot === "morning" ? "Morning" : "Evening"}
                          {skipped ? " · Skipped" : ""}
                        </p>
                      </div>
                      {entry && !entry.id.startsWith("optimistic-") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-pill h-8 px-3 shrink-0"
                          disabled={disabled || undo.isPending}
                          onClick={() =>
                            undo.mutate(
                              { entryId: entry.id },
                              { onError: () => toast.error("Couldn't undo that just now") },
                            )
                          }
                        >
                          <Undo2 className="size-3.5 mr-1" /> Undo
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className={cn("rounded-pill h-8 px-3 shrink-0", done && "opacity-60")}
                          disabled={disabled || log.isPending}
                          onClick={() =>
                            log.mutate(
                              {
                                planId: plan.id,
                                scheduleId: row.id,
                                slot,
                                status: "completed",
                                date: key,
                              },
                              {
                                onSuccess: () => toast.success("Logged"),
                                onError: () => toast.error("Couldn't log that just now"),
                              },
                            )
                          }
                        >
                          <Check className="size-3.5 mr-1" /> Log it
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </SurfaceCard>
          );
        })}
      </div>
      {days.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-body text-[12px] text-primary underline underline-offset-2"
        >
          {expanded ? "Show fewer days" : `Show the last ${days.length} days`}
        </button>
      )}
      <p className="font-body text-[12px] text-muted-foreground leading-snug">
        You can log a day you missed at the time — it still counts.
      </p>
    </div>
  );
};

export default CatchUpDays;
