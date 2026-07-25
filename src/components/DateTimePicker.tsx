import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  /** ISO-ish "YYYY-MM-DDTHH:mm" local string, or "" */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minDate?: Date;
}

const pad = (n: number) => n.toString().padStart(2, "0");

const parseValue = (v: string): { date: Date | undefined; hh: string; mm: string } => {
  if (!v) return { date: undefined, hh: "18", mm: "00" };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { date: undefined, hh: "18", mm: "00" };
  return { date: d, hh: pad(d.getHours()), mm: pad(d.getMinutes()) };
};

const buildValue = (date: Date, hh: string, mm: string): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${hh}:${mm}`;

/** Times at 15-minute intervals from 00:00 → 23:45. */
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = ["00", "15", "30", "45"];

const DateTimePicker = ({ value, onChange, placeholder = "Pick date & time", minDate }: Props) => {
  const { date, hh, mm } = parseValue(value);

  const setDate = (d: Date | undefined) => {
    if (!d) return;
    onChange(buildValue(d, hh, mm));
  };
  const setHh = (next: string) => {
    if (!date) {
      const now = new Date();
      onChange(buildValue(now, next, mm));
    } else onChange(buildValue(date, next, mm));
  };
  const setMm = (next: string) => {
    if (!date) {
      const now = new Date();
      onChange(buildValue(now, hh, next));
    } else onChange(buildValue(date, hh, next));
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
            {date ? format(date, "EEE d MMM · HH:mm") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          initialFocus
          disabled={minDate ? { before: minDate } : undefined}
          className={cn("p-3 pointer-events-auto")}
        />
        <div className="border-t border-border px-3 py-2.5 flex items-center gap-2 bg-card">
          <Clock className="size-4 text-foreground/60" />
          <select
            aria-label="Hour"
            className="flex-1 h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={hh}
            onChange={(e) => setHh(e.target.value)}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <span className="font-body text-sm text-foreground/60">:</span>
          <select
            aria-label="Minute"
            className="flex-1 h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={mm}
            onChange={(e) => setMm(e.target.value)}
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateTimePicker;
