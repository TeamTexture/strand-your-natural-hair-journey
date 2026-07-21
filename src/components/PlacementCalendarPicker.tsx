import { useMemo } from "react";
import { addDays, format, isSameMonth, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { PlacementSlot, SLOT_LABEL, useTakenPlacements, usePlacementRates } from "@/hooks/useBrandOffers";
import { cn } from "@/lib/utils";

interface Selection {
  slot: PlacementSlot;
  dates: string[]; // yyyy-mm-dd
}

interface Props {
  month: Date;
  slot?: PlacementSlot;
  slots?: PlacementSlot[]; // when provided, a date is taken if ANY of these slots is taken
  selection: string[]; // yyyy-mm-dd list
  onToggleDate: (date: string) => void;
  onMonthChange: (d: Date) => void;
  excludeOfferId?: string;
}

/** Calendar for picking placement dates. Unavailable dates (already held by
 *  another approved/paid/live offer) are locked. */
const PlacementCalendarPicker = ({
  month,
  slot,
  slots,
  selection,
  onToggleDate,
  onMonthChange,
  excludeOfferId,
}: Props) => {
  const { data: taken = [] } = useTakenPlacements();
  const takenMap = useMemo(() => {
    const activeSlots = slots && slots.length > 0 ? slots : slot ? [slot] : [];
    const map = new Map<string, "pending" | "live">();
    if (activeSlots.length === 0) return map;
    for (const t of taken) {
      if (!activeSlots.includes(t.slot as PlacementSlot)) continue;
      if (t.offer_id === excludeOfferId) continue;
      const kind: "pending" | "live" =
        t.status === "under_review" || t.status === "approved_unpaid" ? "pending" : "live";
      // "live" wins over "pending" on the same date
      const existing = map.get(t.placement_date);
      if (existing === "live") continue;
      map.set(t.placement_date, kind);
    }
    return map;
  }, [taken, slot, slots, excludeOfferId]);


  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => onMonthChange(addDays(startOfMonth(month), -1))}
          className="text-primary text-lg px-2"
        >
          ‹
        </button>
        <p className="font-display text-sm">{format(month, "MMMM yyyy")}</p>
        <button
          type="button"
          onClick={() => onMonthChange(addDays(endOfMonth(month), 1))}
          className="text-primary text-lg px-2"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[9px] uppercase tracking-wider text-muted-foreground text-center mb-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const inMonth = isSameMonth(d, month);
          const past = d < today;
          const isTaken = takenSet.has(key);
          const isSelected = selection.includes(key);
          const disabled = past || isTaken || !inMonth;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onToggleDate(key)}
              className={cn(
                "aspect-square rounded-md text-[11px] font-body transition-colors",
                !inMonth && "opacity-30",
                disabled && "text-muted-foreground/40 line-through cursor-not-allowed",
                !disabled && !isSelected && "hover:bg-primary/10 text-foreground",
                isSelected && "bg-primary text-primary-foreground font-medium",
              )}
              aria-label={`${key}${isTaken ? " — unavailable" : ""}`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1.5 font-body">
        Grey dates are already booked or past.
      </p>
    </div>
  );
};

export default PlacementCalendarPicker;
