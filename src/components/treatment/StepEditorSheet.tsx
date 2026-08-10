import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import SectionLabel from "@/components/SectionLabel";
import { cn } from "@/lib/utils";
import type { ScheduleRow } from "@/lib/treatmentSchedule";
import type { StepInput } from "@/hooks/useTreatmentPlans";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const Chip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-pill border px-3 py-1.5 font-body text-[13px] min-h-[38px] transition-colors",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-card text-foreground border-border",
    )}
  >
    {children}
  </button>
);

/** Week window control — whole plan, or a from/to range within the plan. */
export const WeekWindowFields = ({
  durationWeeks,
  startWeek,
  endWeek,
  onChange,
}: {
  durationWeeks: number;
  startWeek: number | null;
  endWeek: number | null;
  onChange: (v: { start_week: number | null; end_week: number | null }) => void;
}) => {
  const custom = startWeek != null || endWeek != null;
  const weeks = Array.from({ length: durationWeeks }, (_, i) => i + 1);
  const selectClass =
    "rounded-[10px] border border-border bg-card px-2 py-2 text-sm font-body text-foreground focus:outline-none focus:border-primary/60";

  return (
    <div className="space-y-2">
      <SectionLabel className="px-0 mt-0 mb-1.5">Which weeks</SectionLabel>
      <div className="flex flex-wrap gap-2">
        <Chip active={!custom} onClick={() => onChange({ start_week: null, end_week: null })}>
          Whole plan
        </Chip>
        <Chip
          active={custom}
          onClick={() => onChange({ start_week: startWeek ?? 1, end_week: endWeek ?? durationWeeks })}
        >
          Certain weeks
        </Chip>
      </div>
      {custom && (
        <div className="flex items-center gap-2">
          <label className="font-body text-[12px] text-muted-foreground">From week</label>
          <select
            aria-label="From week"
            className={selectClass}
            value={String(startWeek ?? 1)}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChange({ start_week: v, end_week: Math.max(v, endWeek ?? durationWeeks) });
            }}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <label className="font-body text-[12px] text-muted-foreground">to</label>
          <select
            aria-label="To week"
            className={selectClass}
            value={String(endWeek ?? durationWeeks)}
            onChange={(e) => onChange({ start_week: startWeek ?? 1, end_week: Number(e.target.value) })}
          >
            {weeks
              .filter((w) => w >= (startWeek ?? 1))
              .map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
          </select>
        </div>
      )}
    </div>
  );
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  durationWeeks: number;
  /** Existing row when editing; leave undefined to add a new step. */
  row?: ScheduleRow;
  /** When adding a step from a later week, start its window there. */
  defaultStartWeek?: number | null;
  saving?: boolean;
  onSave: (v: StepInput) => void;
  onDelete?: () => void;
}

/**
 * One step, edited on its own. Used to lay out steps for weeks that haven't
 * arrived yet and to change a step later without touching anything logged.
 */
const StepEditorSheet = ({
  open,
  onOpenChange,
  durationWeeks,
  row,
  defaultStartWeek,
  saving,
  onSave,
  onDelete,
}: Props) => {
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [cadence, setCadence] = useState<StepInput["cadence"]>("daily");
  const [days, setDays] = useState<number[]>([]);
  const [timeOfDay, setTimeOfDay] = useState<StepInput["time_of_day"]>("evening");
  const [startWeek, setStartWeek] = useState<number | null>(null);
  const [endWeek, setEndWeek] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(row?.task_name ?? "");
    setInstructions(row?.instructions ?? "");
    setCadence((row?.cadence as StepInput["cadence"]) ?? "daily");
    setDays(row?.days_of_week ?? []);
    setTimeOfDay((row?.time_of_day as StepInput["time_of_day"]) ?? "evening");
    setStartWeek(row ? row.start_week ?? null : defaultStartWeek && defaultStartWeek > 1 ? defaultStartWeek : null);
    setEndWeek(row?.end_week ?? null);
  }, [open, row, defaultStartWeek]);

  const submit = () => {
    if (name.trim().length < 2) {
      toast.error("Give the step a name first");
      return;
    }
    if (cadence === "specific_days" && days.length === 0) {
      toast.error("Pick at least one day");
      return;
    }
    onSave({
      task_name: name,
      instructions: instructions.trim() || null,
      cadence,
      days_of_week: cadence === "specific_days" ? [...days].sort() : null,
      time_of_day: timeOfDay,
      start_week: startWeek,
      end_week: endWeek,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[335px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-[18px]">
            {row ? "Edit this step" : "Add a step"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apply scalp serum" />
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="A few drops along each parting, then massage in"
            rows={2}
          />

          <div className="space-y-2">
            <SectionLabel className="px-0 mt-0 mb-1.5">How often</SectionLabel>
            <div className="flex flex-wrap gap-2">
              <Chip active={cadence === "daily"} onClick={() => setCadence("daily")}>
                Every day
              </Chip>
              <Chip active={cadence === "specific_days"} onClick={() => setCadence("specific_days")}>
                Certain days
              </Chip>
              <Chip active={cadence === "weekly"} onClick={() => setCadence("weekly")}>
                Once a week
              </Chip>
            </div>
          </div>

          {cadence === "specific_days" && (
            <div className="flex flex-wrap gap-1.5">
              {DAY_LABELS.map((label, d) => (
                <Chip
                  key={d}
                  active={days.includes(d)}
                  onClick={() =>
                    setDays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]))
                  }
                >
                  {label}
                </Chip>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <SectionLabel className="px-0 mt-0 mb-1.5">Time of day</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {(["morning", "evening", "both"] as const).map((t) => (
                <Chip key={t} active={timeOfDay === t} onClick={() => setTimeOfDay(t)}>
                  {t === "both" ? "Both" : t === "morning" ? "Morning" : "Evening"}
                </Chip>
              ))}
            </div>
          </div>

          <WeekWindowFields
            durationWeeks={durationWeeks}
            startWeek={startWeek}
            endWeek={endWeek}
            onChange={(v) => {
              setStartWeek(v.start_week);
              setEndWeek(v.end_week);
            }}
          />

          <div className="flex gap-2 pt-1">
            <Button variant="gold" className="rounded-pill flex-1" disabled={saving} onClick={submit}>
              {row ? "Save changes" : "Add step"}
            </Button>
            {row && onDelete && (
              <Button variant="outline" className="rounded-pill" disabled={saving} onClick={onDelete}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StepEditorSheet;
