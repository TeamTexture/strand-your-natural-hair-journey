/**
 * A time picker built as ONE dropdown listing full times with am/pm
 * ("9:00 am", "9:15 am", …) — no separate hour / minute / meridiem bars.
 * Value is always a 24-hour "HH:MM" string (or "" when empty).
 */
interface TimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Minute granularity. 5 by default; pass 0 for whole hours only. */
  minuteStep?: number;
  className?: string;
  disabled?: boolean;
  /** Shown as the blank option when nothing is chosen yet. */
  placeholder?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

const parse = (value: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min) || h > 23 || min > 59) return null;
  return { h, min };
};

/** "13:30" → "1:30 pm" */
export const formatTimeLabel = (h24: number, min: number) => {
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${pad(min)} ${h24 >= 12 ? "pm" : "am"}`;
};

const TimeSelect = ({
  value,
  onChange,
  minuteStep = 0,
  className = "",
  disabled,
  placeholder = "Choose a time",
}: TimeSelectProps) => {
  const parsed = parse(value);
  const step = minuteStep > 0 ? minuteStep : 60;

  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h += 1) {
    for (let m = 0; m < 60; m += step) {
      options.push({ value: `${pad(h)}:${pad(m)}`, label: formatTimeLabel(h, m) });
    }
  }

  // Keep an off-grid stored value (e.g. 09:07) selectable rather than blanking it.
  const current = parsed ? `${pad(parsed.h)}:${pad(parsed.min)}` : "";
  if (current && !options.some((o) => o.value === current)) {
    options.push({ value: current, label: formatTimeLabel(parsed!.h, parsed!.min) });
    options.sort((a, b) => a.value.localeCompare(b.value));
  }

  return (
    <select
      aria-label="Time"
      disabled={disabled}
      className={`w-full min-w-0 rounded-[10px] border border-border bg-card px-3 py-2.5 text-sm font-body text-foreground focus:outline-none focus:border-primary/60 disabled:opacity-50 ${className}`}
      value={current}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
};

export default TimeSelect;
