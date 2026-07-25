import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  /** Local "YYYY-MM-DDTHH:mm" 24h string, or "" */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minDate?: Date;
}

const pad = (n: number) => n.toString().padStart(2, "0");

const parseValue = (v: string) => {
  if (!v) return { date: undefined as Date | undefined, h24: 18, minute: "00" };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { date: undefined, h24: 18, minute: "00" };
  return { date: d, h24: d.getHours(), minute: pad(d.getMinutes()) };
};

const buildValue = (date: Date, h24: number, minute: string): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(h24)}:${minute}`;

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = ["00", "15", "30", "45"];

const to12h = (h24: number) => {
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return { h, period };
};
const to24h = (h12: number, period: "AM" | "PM") => {
  if (period === "AM") return h12 === 12 ? 0 : h12;
  return h12 === 12 ? 12 : h12 + 12;
};

const DateTimePicker = ({ value, onChange, placeholder = "Pick date & time", minDate }: Props) => {
  const { date, h24, minute } = parseValue(value);
  const { h: h12, period } = to12h(h24);

  const commit = (d: Date | undefined, nextH24: number, nextMinute: string) => {
    const base = d ?? date ?? new Date();
    onChange(buildValue(base, nextH24, nextMinute));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-10 rounded-md",
            !date && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4 mr-2 shrink-0" />
          <span className="truncate">
            {date ? format(date, "EEE d MMM · h:mm a") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 pointer-events-auto w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden"
        align="start"
        sideOffset={6}
      >
        <div className="overflow-x-auto">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => d && commit(d, h24, minute)}
            initialFocus
            disabled={minDate ? { before: minDate } : undefined}
            className={cn("p-3 pointer-events-auto")}
          />
        </div>
        <div className="border-t border-border px-3 py-2.5 flex items-center gap-1.5 bg-card">
          <Clock className="size-4 text-foreground/60 shrink-0" />
          <select
            aria-label="Hour"
            className="min-w-0 flex-1 h-9 rounded-md border border-border bg-background px-1.5 text-sm"
            value={h12}
            onChange={(e) => commit(date, to24h(Number(e.target.value), period), minute)}
          >
            {HOURS_12.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <span className="font-body text-sm text-foreground/60">:</span>
          <select
            aria-label="Minute"
            className="min-w-0 flex-1 h-9 rounded-md border border-border bg-background px-1.5 text-sm"
            value={minute}
            onChange={(e) => commit(date, h24, e.target.value)}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <div className="inline-flex rounded-md border border-border overflow-hidden shrink-0">
            {(["AM", "PM"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => commit(date, to24h(h12, p), minute)}
                className={cn(
                  "px-2.5 h-9 text-xs font-medium transition-colors",
                  period === p ? "bg-primary text-primary-foreground" : "bg-background text-foreground/70",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateTimePicker;
