import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import TimeSelect from "@/components/TimeSelect";

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

const to12h = (h24: number) => {
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return { h, period };
};

const DateTimePicker = ({ value, onChange, placeholder = "Pick date & time", minDate }: Props) => {
  const { date, h24, minute } = parseValue(value);

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
        <div className="border-t border-border px-3 py-2.5 flex items-center gap-2 bg-card">
          <Clock className="size-4 text-foreground/60 shrink-0" />
          <TimeSelect
            minuteStep={15}
            value={`${pad(h24)}:${minute}`}
            onChange={(v) => {
              const h = Number(v.slice(0, 2));
              if (Number.isNaN(h)) return;
              commit(date, h, v.slice(3, 5));
            }}
          />
        </div>

      </PopoverContent>
    </Popover>
  );
};

export default DateTimePicker;
