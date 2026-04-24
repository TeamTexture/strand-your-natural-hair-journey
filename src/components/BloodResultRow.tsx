import { cn } from "@/lib/utils";

type Status = "low" | "normal" | "warn" | "untested";

interface Props {
  label: string;
  value: string;
  status: Status;
}

const dotColor = (s: Status) =>
  ({ low: "bg-warn", warn: "bg-warn", normal: "bg-good", untested: "bg-muted-foreground/40" }[s]);
const valueColor = (s: Status) =>
  ({ low: "text-warn", warn: "text-warn", normal: "text-good", untested: "text-muted-foreground" }[s]);

const BloodResultRow = ({ label, value, status }: Props) => (
  <div className="flex items-center gap-3 py-2.5">
    <span className={cn("size-2.5 rounded-full shrink-0", dotColor(status))} />
    <span className="flex-1 text-sm text-foreground font-body min-w-0">{label}</span>
    <span className={cn("text-xs font-body font-medium text-right", valueColor(status))}>{value}</span>
  </div>
);

export default BloodResultRow;
