// Month calendar shown on the brand + pro campaign dashboards.
// Mirrors the admin unified calendar: every booked slot-day is populated for
// the FULL run of the campaign (starts_on..ends_on), colour-coded green for
// running, amber for scheduled/awaiting acceptance. The viewer's own
// campaigns are ringed in gold and tappable.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  SLOT_LABEL,
  TakenPlacement,
  deriveBrandOfferStatus,
  londonToday,
  useTakenPlacements,
} from "@/hooks/useBrandOffers";
import { ownerOfferRoute, OwnerMode } from "@/hooks/useOwnerMode";
import { cn } from "@/lib/utils";

type DayKind = "live" | "scheduled";

interface DayEntry {
  offer_id: string;
  owner: string;
  headline: string | null;
  slots: Set<string>;
  kind: DayKind;
  isMine: boolean;
}

const CampaignRunCalendar = ({ ownerMode }: { ownerMode: OwnerMode }) => {
  const nav = useNavigate();
  const { data: taken = [] } = useTakenPlacements();
  const [month, setMonth] = useState(() => new Date());
  const [openDate, setOpenDate] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const today = londonToday();
    const map = new Map<string, Map<string, DayEntry>>();
    for (const t of taken as TakenPlacement[]) {
      const derived = deriveBrandOfferStatus(
        { status: t.status, starts_on: t.starts_on, ends_on: t.ends_on },
        today,
      );
      if (derived === "ended" || derived === "cancelled" || derived === "rejected") continue;
      const kind: DayKind =
        t.status === "under_review" || t.status === "approved_unpaid" || derived === "upcoming"
          ? "scheduled"
          : "live";
      const day = map.get(t.placement_date) ?? new Map<string, DayEntry>();
      const existing = day.get(t.offer_id);
      if (existing) {
        existing.slots.add(t.slot);
        if (kind === "live") existing.kind = "live";
      } else {
        day.set(t.offer_id, {
          offer_id: t.offer_id,
          owner: t.owner_display_name,
          headline: t.headline,
          slots: new Set([t.slot]),
          kind,
          isMine: t.is_mine,
        });
      }
      map.set(t.placement_date, day);
    }
    return map;
  }, [taken]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);

  const todayKey = londonToday();
  const openEntries = openDate ? Array.from(byDate.get(openDate)?.values() ?? []) : [];

  return (
    <SurfaceCard className="p-3">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          className="p-1 text-primary"
        >
          <ChevronLeft className="size-4" />
        </button>
        <p className="font-display text-sm">{format(month, "MMMM yyyy")}</p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="p-1 text-primary"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[9px] uppercase tracking-wider text-muted-foreground text-center mb-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const inMonth = isSameMonth(d, month);
          const entries = Array.from(byDate.get(key)?.values() ?? []);
          const hasLive = entries.some((e) => e.kind === "live");
          const hasScheduled = entries.some((e) => e.kind === "scheduled");
          const mine = entries.some((e) => e.isMine);
          return (
            <button
              key={key}
              type="button"
              onClick={() => entries.length && setOpenDate(key)}
              className={cn(
                "aspect-square rounded-md text-[11px] font-body flex flex-col items-center justify-center gap-0.5 border border-transparent",
                !inMonth && "opacity-30",
                key === todayKey && "border-primary/50",
                mine && "ring-1 ring-primary/60",
                entries.length ? "bg-secondary/60" : "text-muted-foreground",
              )}
              aria-label={`${key}${entries.length ? ` — ${entries.length} campaign${entries.length === 1 ? "" : "s"}` : ""}`}
            >
              <span>{d.getDate()}</span>
              <span className="flex gap-0.5 h-1.5">
                {hasLive && <span className="size-1.5 rounded-full bg-good" />}
                {hasScheduled && <span className="size-1.5 rounded-full bg-warn" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground mt-2 font-body">
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-good" /> Live now
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-warn" /> Scheduled / awaiting
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-sm ring-1 ring-primary/60" /> Yours
        </span>
      </div>

      <Sheet open={!!openDate} onOpenChange={(o) => !o && setOpenDate(null)}>
        <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display text-base">
              {openDate ? format(new Date(`${openDate}T00:00:00`), "EEEE d MMMM yyyy") : ""}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-2 pt-3">
            {openEntries.length === 0 && (
              <p className="text-[12px] text-muted-foreground font-body">No campaigns booked.</p>
            )}
            {openEntries.map((e) => (
              <button
                key={e.offer_id}
                type="button"
                disabled={!e.isMine}
                onClick={() => e.isMine && nav(ownerOfferRoute(ownerMode, e.offer_id))}
                className={cn(
                  "w-full text-left rounded-[12px] border border-border bg-card p-3",
                  e.isMine && "hover:border-primary/50",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 rounded-full shrink-0",
                      e.kind === "live" ? "bg-good" : "bg-warn",
                    )}
                  />
                  <p className="font-body text-[13px] font-semibold truncate">
                    {e.isMine ? "Your campaign" : e.owner}
                  </p>
                  <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {e.kind === "live" ? "Live" : "Scheduled"}
                  </span>
                </div>
                <p className="text-[11.5px] text-foreground/70 font-body mt-0.5 leading-snug">
                  {e.headline?.trim() || "Banner campaign"}
                </p>
                <p className="text-[10.5px] text-muted-foreground font-body mt-0.5">
                  {Array.from(e.slots)
                    .map((s) => SLOT_LABEL[s as keyof typeof SLOT_LABEL] ?? s)
                    .join(" · ")}
                </p>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </SurfaceCard>
  );
};

export default CampaignRunCalendar;
