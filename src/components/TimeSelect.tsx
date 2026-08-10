/**
 * A time picker built from plain dropdowns — hour, minute and am/pm — so it
 * reads the same on every device instead of relying on the browser's native
 * time widget. Value is always a 24-hour "HH:MM" string (or "" when empty).
 */
interface TimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Minute granularity. 5 by default; pass 0 to hide minutes entirely. */
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

const TimeSelect = ({
  value,
  onChange,
  minuteStep = 5,
  className = "",
  disabled,
  placeholder = "--",
}: TimeSelectProps) => {
  const parsed = parse(value);
  const hour24 = parsed?.h ?? null;
  const minute = parsed?.min ?? 0;

  const hour12 = hour24 === null ? null : hour24 % 12 === 0 ? 12 : hour24 % 12;
  const meridiem: "am" | "pm" = hour24 !== null && hour24 >= 12 ? "pm" : "am";

  const emit = (h12: number | null, min: number, mer: "am" | "pm") => {
    if (h12 === null) {
      onChange("");
      return;
    }
    const base = h12 % 12;
    const h24 = mer === "pm" ? base + 12 : base;
    onChange(`${pad(h24)}:${pad(minuteStep === 0 ? 0 : min)}`);
  };

  const selectClass =
    "flex-1 min-w-0 rounded-[10px] border border-border bg-card px-2 py-2.5 text-sm font-body text-foreground focus:outline-none focus:border-primary/60 disabled:opacity-50";

  const minutes: number[] = [];
  if (minuteStep > 0) for (let m = 0; m < 60; m += minuteStep) minutes.push(m);

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <select
        aria-label="Hour"
        disabled={disabled}
        className={selectClass}
        value={hour12 === null ? "" : String(hour12)}
        onChange={(e) =>
          emit(e.target.value === "" ? null : Number(e.target.value), minute, meridiem)
        }
      >
        <option value="">{placeholder}</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>

      {minuteStep > 0 && (
        <>
          <span className="font-body text-sm text-muted-foreground">:</span>
          <select
            aria-label="Minute"
            disabled={disabled || hour12 === null}
            className={selectClass}
            value={pad(minute)}
            onChange={(e) => emit(hour12, Number(e.target.value), meridiem)}
          >
            {minutes.map((m) => (
              <option key={m} value={pad(m)}>
                {pad(m)}
              </option>
            ))}
          </select>
        </>
      )}

      <select
        aria-label="am or pm"
        disabled={disabled || hour12 === null}
        className={selectClass}
        value={meridiem}
        onChange={(e) => emit(hour12, minute, e.target.value as "am" | "pm")}
      >
        <option value="am">am</option>
        <option value="pm">pm</option>
      </select>
    </div>
  );
};

export default TimeSelect;
