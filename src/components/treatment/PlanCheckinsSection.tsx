import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Camera, Check, ChevronDown, ClipboardCheck } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSignedMedia } from "@/hooks/useSignedMedia";
import type { CheckinRow } from "@/hooks/useTreatmentCheckin";
import type { TreatmentMediaRow } from "@/lib/treatmentMedia";
import type { EntryRow, ScheduleRow, CheckinCycle } from "@/lib/treatmentSchedule";
import {
  cycleConsistencyLine,
  cycleState,
  fromDateKey,
  todayKey,
} from "@/lib/treatmentSchedule";

interface Props {
  cycles: CheckinCycle[];
  checkins: CheckinRow[];
  media: TreatmentMediaRow[];
  schedule: ScheduleRow[];
  entries: EntryRow[];
  startDate: string;
  everyWeeks: number;
  milestoneWeeks: number[];
  onCheckin: (week: number) => void;
  /** Opens the check-in cadence row in Plan settings. */
  onChangeCadence: () => void;
  disabled?: boolean;
}

const cadenceLabel = (n: number) =>
  n === 1 ? "Every week" : n === 2 ? "Every 2 weeks" : `Every ${n} weeks`;

/**
 * CHECK-INS — the reflection rhythm, every cycle in one list.
 *
 * A cycle that was never written up is quiet and still fillable, forever. There
 * is no counter of missed check-ins and no judgement styling anywhere here: a
 * cycle she didn't write about is not a cycle she failed.
 */
const PlanCheckinsSection = ({
  cycles,
  checkins,
  media,
  schedule,
  entries,
  startDate,
  everyWeeks,
  milestoneWeeks,
  onCheckin,
  onChangeCadence,
  disabled,
}: Props) => {
  const [open, setOpen] = useState(false);
  const today = todayKey();

  const savedRow = (week: number) =>
    checkins.find((c) => c.week_number === week && c.submitted_at) ?? null;
  const savedCount = cycles.filter((c) => savedRow(c.closingWeek)).length;

  const photoPaths = cycles
    .map((c) => {
      const row = savedRow(c.closingWeek);
      if (!row) return null;
      return media.find((m) => m.checkin_id === row.id && m.media_type === "photo") ?? null;
    })
    .filter(Boolean)
    .map((m) => (m as TreatmentMediaRow).storage_path);
  const { urls } = useSignedMedia(photoPaths);

  return (
    <SurfaceCard padded={false} className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
      >
        <ClipboardCheck className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className="block font-body text-[14px] font-semibold">Check-ins</span>
          <span className="block font-body text-[11.5px] text-muted-foreground mt-0.5">
            {cadenceLabel(everyWeeks)} · {savedCount} of {cycles.length} saved
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 space-y-1.5 border-t border-border/60">
          {cycles.map((c) => {
            const row = savedRow(c.closingWeek);
            const state = cycleState(c, cycles, !!row, today);
            const isMilestone = milestoneWeeks.includes(c.closingWeek);
            const range = `${format(fromDateKey(c.start), "d MMM")} – ${format(
              fromDateKey(c.end),
              "d MMM",
            )}`;
            const photo = row
              ? media.find((m) => m.checkin_id === row.id && m.media_type === "photo") ?? null
              : null;

            return (
              <div
                key={c.cycle}
                className={cn(
                  "rounded-[14px] border px-3.5 py-3 space-y-1.5",
                  state === "open"
                    ? "border-primary border-[1.5px] bg-card"
                    : state === "saved"
                      ? "border-border bg-card"
                      : state === "missed"
                        ? "border-border/70 bg-card"
                        : "border-border/50 bg-secondary/50",
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "font-body text-[10px] uppercase tracking-[0.18em]",
                        state === "open" ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      Cycle {c.cycle} of {cycles.length}
                    </p>
                    <p
                      className={cn(
                        "font-display text-[16px] leading-tight mt-0.5",
                        state === "not_open" && "text-muted-foreground",
                      )}
                    >
                      {c.startWeek === c.closingWeek
                        ? `Week ${c.closingWeek}`
                        : `Weeks ${c.startWeek}–${c.closingWeek}`}
                    </p>
                    <p className="font-body text-[11.5px] text-muted-foreground mt-0.5">{range}</p>
                  </div>

                  <span className="shrink-0 flex items-center gap-1.5">
                    {isMilestone && (
                      <span className="inline-flex items-center gap-1 rounded-pill bg-primary/10 px-2 py-0.5 font-body text-[10px] font-semibold text-primary">
                        <Camera className="size-3" /> Photo
                      </span>
                    )}
                    {photo && urls[photo.storage_path] && (
                      <img
                        src={urls[photo.storage_path]}
                        alt={`Cycle ${c.cycle} photo`}
                        loading="lazy"
                        className="size-10 rounded-[8px] object-cover bg-secondary"
                      />
                    )}
                  </span>
                </div>

                {state === "open" && (
                  <>
                    <p className="font-body text-[12.5px] text-muted-foreground leading-snug">
                      {cycleConsistencyLine(schedule, entries, startDate, c, today)}
                    </p>
                    <Button
                      variant="outline"
                      className="rounded-pill w-full"
                      onClick={() => onCheckin(c.closingWeek)}
                    >
                      {disabled ? "Read check-in" : "Start check-in"}
                    </Button>
                  </>
                )}

                {state === "saved" && row && (
                  <button
                    type="button"
                    onClick={() => onCheckin(c.closingWeek)}
                    className="w-full text-left space-y-1"
                  >
                    <p className="flex items-center gap-1.5 font-body text-[11.5px] text-muted-foreground">
                      <span className="size-4 rounded-full bg-good/15 text-good flex items-center justify-center">
                        <Check className="size-2.5" />
                      </span>
                      Saved {format(parseISO(row.submitted_at!), "d MMM yyyy")}
                    </p>
                    {row.written_note && (
                      <p className="font-body text-[12.5px] leading-snug text-foreground/85 line-clamp-2 [overflow-wrap:anywhere]">
                        “{row.written_note}”
                      </p>
                    )}
                    <p className="font-body text-[11px] text-primary">Read it again</p>
                  </button>
                )}

                {state === "missed" && (
                  <button
                    type="button"
                    onClick={() => onCheckin(c.closingWeek)}
                    className="font-body text-[12px] text-primary underline underline-offset-2"
                  >
                    {disabled ? "Read check-in" : "Write this one up whenever suits"}
                  </button>
                )}

                {state === "not_open" && (
                  <p className="font-body text-[12px] text-muted-foreground">
                    Opens {format(fromDateKey(c.opensOn), "EEE d MMM")}
                  </p>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={onChangeCadence}
            className="font-body text-[12px] text-primary underline underline-offset-2 pt-1"
          >
            Change how often you check in
          </button>
        </div>
      )}
    </SurfaceCard>
  );
};

export default PlanCheckinsSection;
