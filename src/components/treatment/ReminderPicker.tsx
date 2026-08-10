import SurfaceCard from "@/components/SurfaceCard";
import TimeSelect from "@/components/TimeSelect";
import { cn } from "@/lib/utils";

export interface ReminderSettings {
  frequency: "off" | "daily" | "weekly";
  weekday: number; // 0 = Sunday
  hour: number; // 0-23, member's local time
}

export const defaultReminder: ReminderSettings = { frequency: "weekly", weekday: 0, hour: 9 };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function reminderSummary(r: ReminderSettings) {
  if (r.frequency === "off") return "No reminders";
  const time = formatHour(r.hour);
  return r.frequency === "daily"
    ? `Every day at ${time}`
    : `${DAY_LONG[r.weekday]}s at ${time}`;
}

export function formatHour(h: number) {
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
}

const Pill = ({
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
      "rounded-pill border px-3 py-1.5 font-body text-[12px] transition-colors",
      active
        ? "border-primary bg-primary/15 text-foreground"
        : "border-border bg-background text-muted-foreground",
    )}
  >
    {children}
  </button>
);

/**
 * Check-in reminder cadence. The member chooses off / daily / weekly, the day
 * (weekly only) and the hour — all in their own local time.
 */
const ReminderPicker = ({
  value,
  onChange,
  disabled,
}: {
  value: ReminderSettings;
  onChange: (next: ReminderSettings) => void;
  disabled?: boolean;
}) => {
  const set = (patch: Partial<ReminderSettings>) => {
    if (disabled) return;
    onChange({ ...value, ...patch });
  };

  return (
    <SurfaceCard className={cn("space-y-3", disabled && "opacity-60")}>
      <div>
        <p className="font-body text-[14px] font-semibold">Remind me to check in</p>
        <p className="font-body text-[12px] text-muted-foreground">
          By email, in your time. {reminderSummary(value)}.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Pill active={value.frequency === "off"} onClick={() => set({ frequency: "off" })}>
          Off
        </Pill>
        <Pill active={value.frequency === "daily"} onClick={() => set({ frequency: "daily" })}>
          Daily
        </Pill>
        <Pill active={value.frequency === "weekly"} onClick={() => set({ frequency: "weekly" })}>
          Weekly
        </Pill>
      </div>

      {value.frequency === "weekly" && (
        <div className="space-y-1.5">
          <p className="font-body text-[12px] text-muted-foreground">Which day</p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <Pill key={d} active={value.weekday === i} onClick={() => set({ weekday: i })}>
                {d}
              </Pill>
            ))}
          </div>
        </div>
      )}

      {value.frequency !== "off" && (
        <div className="space-y-1.5">
          <p className="font-body text-[12px] text-muted-foreground">What time</p>
          <TimeSelect
            minuteStep={0}
            value={`${String(value.hour).padStart(2, "0")}:00`}
            onChange={(v) => {
              const h = Number(v.slice(0, 2));
              if (!Number.isNaN(h)) set({ hour: h });
            }}
          />
        </div>
      )}
    </SurfaceCard>
  );
};

export default ReminderPicker;
