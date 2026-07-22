// 12-hour time picker with explicit AM/PM. Emits a canonical HH:MM (24-hour)
// string via onChange so downstream storage (appointments.appointment_time)
// stays consistent with the existing formatTime12h renderer. Empty state
// emits "" so the field can be left blank.
import { useEffect, useState } from "react";

interface Props {
  value: string; // "HH:MM" 24-hour, or ""
  onChange: (v: string) => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = ["00", "15", "30", "45"];

const parse = (v: string): { hour: number; minute: string; ampm: "AM" | "PM" } | null => {
  if (!v) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const h24 = Number(m[1]);
  if (h24 < 0 || h24 > 23) return null;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const hour = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour, minute: m[2], ampm };
};

const TimePicker12h = ({ value, onChange }: Props) => {
  const parsed = parse(value);
  const [hour, setHour] = useState<number | "">(parsed?.hour ?? "");
  const [minute, setMinute] = useState<string>(parsed?.minute ?? "00");
  const [ampm, setAmpm] = useState<"AM" | "PM">(parsed?.ampm ?? "AM");

  useEffect(() => {
    if (hour === "") { onChange(""); return; }
    let h24 = hour % 12;
    if (ampm === "PM") h24 += 12;
    onChange(`${String(h24).padStart(2, "0")}:${minute}`);
  }, [hour, minute, ampm, onChange]);

  const selectCls =
    "flex-1 text-sm p-2.5 rounded-[10px] border border-border bg-card focus:outline-none focus:border-primary/60";

  return (
    <div className="flex gap-2">
      <select
        value={hour === "" ? "" : String(hour)}
        onChange={(e) => setHour(e.target.value === "" ? "" : Number(e.target.value))}
        className={selectCls}
        aria-label="Hour"
      >
        <option value="">--</option>
        {HOURS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <select
        value={minute}
        onChange={(e) => setMinute(e.target.value)}
        className={selectCls}
        aria-label="Minute"
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <select
        value={ampm}
        onChange={(e) => setAmpm(e.target.value as "AM" | "PM")}
        className={selectCls}
        aria-label="AM or PM"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
};

export default TimePicker12h;
