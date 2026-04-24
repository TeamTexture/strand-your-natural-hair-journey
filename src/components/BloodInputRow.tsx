import { useId } from "react";
import { cn } from "@/lib/utils";
import { evaluate, statusLabel, BLOOD_RANGES, type BloodStatus } from "@/data/bloodRanges";

interface Props {
  marker: string;
  value: number | null;
  onChange: (v: number | null) => void;
  /** Optional override label (defaults to marker + unit) */
  label?: string;
}

const dotColor = (s: BloodStatus) =>
  ({ low: "bg-warn", high: "bg-warn", normal: "bg-good", untested: "bg-muted-foreground/40" }[s]);
const valueColor = (s: BloodStatus) =>
  ({ low: "text-warn", high: "text-warn", normal: "text-good", untested: "text-muted-foreground" }[s]);

const BloodInputRow = ({ marker, value, onChange, label }: Props) => {
  const id = useId();
  const range = BLOOD_RANGES[marker];
  const status = evaluate(marker, value);
  const unit = range?.unit ?? "";
  const labelText = label ?? `${marker}${unit ? ` (${unit})` : ""}`;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className={cn("size-2.5 rounded-full shrink-0", dotColor(status))} />
      <label htmlFor={id} className="flex-1 text-sm text-foreground font-body min-w-0">
        {labelText}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        autoComplete="off"
        min={0}
        step="any"
        placeholder={unit || "—"}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const n = Number(raw);
          if (Number.isNaN(n) || n < 0) return;
          onChange(n);
        }}
        className="w-20 bg-card border border-border rounded-md px-2 py-1 text-xs text-right font-body focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
      />
      <span className={cn("text-[11px] font-body font-medium w-20 text-right", valueColor(status))}>
        {statusLabel(status)}
      </span>
    </div>
  );
};

export default BloodInputRow;
