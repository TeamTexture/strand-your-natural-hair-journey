import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { supabase } from "@/integrations/supabase/client";
import { deriveBrandOfferStatus, londonToday, PlacementSlot, SLOT_LABEL } from "@/hooks/useBrandOffers";
import { cn } from "@/lib/utils";

const SLOT_COLORS: Record<PlacementSlot, string> = {
  home: "bg-primary/40",
  products: "bg-good/40",
  wash_day: "bg-warn/40",
};

const BOOKING_STATUS_STYLES = {
  live: "bg-good/25 border-good/60 text-good",
  awaiting: "bg-warn/20 border-warn/60 text-warn",
  upcoming: "bg-primary/15 border-primary/50 text-primary",
  ended: "bg-muted/40 border-border text-muted-foreground",
} as const;

type BookingStatusStyle = keyof typeof BOOKING_STATUS_STYLES;

const bookingStyleForOffer = (offer?: { status?: string | null; starts_on?: string | null; ends_on?: string | null }): BookingStatusStyle => {
  if (!offer) return "upcoming";
  if (offer.status === "under_review" || offer.status === "approved_unpaid") return "awaiting";
  const derived = deriveBrandOfferStatus(
    { status: offer.status ?? "draft", starts_on: offer.starts_on, ends_on: offer.ends_on },
    londonToday(),
  );
  if (derived === "live") return "live";
  if (derived === "ended") return "ended";
  return "upcoming";
};

const dayStatusRank: Record<BookingStatusStyle, number> = {
  live: 4,
  awaiting: 3,
  upcoming: 2,
  ended: 1,
};

const AdminBrandCalendar = () => {
  const nav = useNavigate();
  const [month, setMonth] = useState(new Date());

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["admin", "brand-calendar", format(month, "yyyy-MM")],
    queryFn: async () => {
      const start = format(startOfMonth(month), "yyyy-MM-dd");
      const end = format(endOfMonth(month), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("brand_offer_placements")
        .select("id, slot, placement_date, offer_id, brand_offers!inner(headline, status, starts_on, ends_on, brand_user_id, owner_type)")
        .gte("placement_date", start)
        .lte("placement_date", end)
        .in("brand_offers.status", ["under_review", "approved_unpaid", "paid_scheduled", "live", "ended"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);

  const byDateSlot = useMemo(() => {
    const map = new Map<string, Record<string, typeof bookings[number]>>();
    bookings.forEach((b) => {
      const cur = map.get(b.placement_date) ?? {};
      cur[b.slot] = b;
      map.set(b.placement_date, cur);
    });
    return map;
  }, [bookings]);

  return (
    <ScreenLayout>
      <TitleBar title="Booking calendar" onBack={() => nav("/admin/brand-offers")} />
      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setMonth(addDays(startOfMonth(month), -1))} className="text-primary px-2">‹</button>
            <p className="font-display text-sm">{format(month, "MMMM yyyy")}</p>
            <button onClick={() => setMonth(addDays(endOfMonth(month), 1))} className="text-primary px-2">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[9px] uppercase text-muted-foreground text-center mb-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
          </div>
          {isLoading ? <LoadingDot fullScreen={false} /> : (
            <div className="grid grid-cols-7 gap-1">
              {days.map((d) => {
                const key = format(d, "yyyy-MM-dd");
                const slots = byDateSlot.get(key) ?? {};
                const inMonth = isSameMonth(d, month);
                const slotBookings = Object.values(slots);
                const dayStatus = slotBookings.reduce<BookingStatusStyle | null>((best, booking) => {
                  const status = bookingStyleForOffer(booking.brand_offers as { status?: string | null; starts_on?: string | null; ends_on?: string | null });
                  if (!best || dayStatusRank[status] > dayStatusRank[best]) return status;
                  return best;
                }, null);
                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-[46px] rounded-md border border-border p-1 text-[9px] font-body transition-colors",
                      dayStatus && BOOKING_STATUS_STYLES[dayStatus],
                      !inMonth && "opacity-40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-0.5">
                      <p className={cn("font-medium", !dayStatus && "text-muted-foreground")}>{d.getDate()}</p>
                      <div className="flex items-center gap-0.5">
                        {slotBookings.some((b) => (b.brand_offers as { owner_type?: string | null }).owner_type === "brand") && (
                          <span className="inline-flex items-center justify-center size-3 rounded-full bg-foreground text-background text-[7px] font-body font-bold leading-none" title="Brand campaign">B</span>
                        )}
                        {slotBookings.some((b) => (b.brand_offers as { owner_type?: string | null }).owner_type === "pro") && (
                          <span className="inline-flex items-center justify-center size-3 rounded-full bg-primary text-primary-foreground text-[7px] font-body font-bold leading-none" title="Pro campaign">P</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {(["home", "products", "wash_day"] as PlacementSlot[]).map((s) => {
                        const booking = slots[s];
                        if (!booking) return null;
                        const status = bookingStyleForOffer(booking.brand_offers as { status?: string | null; starts_on?: string | null; ends_on?: string | null });
                        return (
                          <div
                            key={s}
                            className={cn(
                              "h-1.5 rounded-full",
                              status === "live" && "bg-good",
                              status === "awaiting" && "bg-warn",
                              status === "upcoming" && SLOT_COLORS[s],
                              status === "ended" && "bg-muted-foreground/40",
                            )}
                            title={`${SLOT_LABEL[s]} · ${status === "awaiting" ? "Awaiting acceptance" : status === "live" ? "Live" : status === "ended" ? "Ended" : "Booked"}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SurfaceCard>

        <SectionLabel className="!px-0">Legend</SectionLabel>
        <div className="grid grid-cols-2 gap-2 text-[11px] font-body">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-good" />
            <span className="text-muted-foreground">Live advert</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-warn" />
            <span className="text-muted-foreground">Awaiting acceptance</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary/60" />
            <span className="text-muted-foreground">Booked / scheduled</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center size-3 rounded-full bg-muted-foreground/40 text-[7px] font-body font-bold leading-none">—</span>
            <span className="text-muted-foreground">Ended</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center size-3 rounded-full bg-foreground text-background text-[7px] font-body font-bold leading-none">B</span>
            <span className="text-muted-foreground">Brand campaign</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center size-3 rounded-full bg-primary text-primary-foreground text-[7px] font-body font-bold leading-none">P</span>
            <span className="text-muted-foreground">Pro campaign</span>
          </div>
    </ScreenLayout>
  );
};

export default AdminBrandCalendar;
