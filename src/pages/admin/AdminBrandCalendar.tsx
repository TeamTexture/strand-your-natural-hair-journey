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
import { PlacementSlot, SLOT_LABEL } from "@/hooks/useBrandOffers";
import { cn } from "@/lib/utils";

const SLOT_COLORS: Record<PlacementSlot, string> = {
  home: "bg-primary/40",
  products: "bg-good/40",
  wash_day: "bg-warn/40",
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
        .select("id, slot, placement_date, offer_id, brand_offers!inner(headline, status, brand_user_id)")
        .gte("placement_date", start)
        .lte("placement_date", end)
        .in("brand_offers.status", ["approved_unpaid", "paid_scheduled", "live", "ended"]);
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
                return (
                  <div key={key} className={cn("min-h-[42px] rounded-md border border-border p-1 text-[9px] font-body", !inMonth && "opacity-40")}>
                    <p className="text-muted-foreground">{d.getDate()}</p>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {(["home", "products", "wash_day"] as PlacementSlot[]).map((s) =>
                        slots[s] ? (
                          <div key={s} className={cn("h-1 rounded-full", SLOT_COLORS[s])} title={SLOT_LABEL[s]} />
                        ) : null,
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SurfaceCard>

        <SectionLabel className="!px-0">Legend</SectionLabel>
        <div className="flex gap-3 text-[11px] font-body">
          {(["home", "products", "wash_day"] as PlacementSlot[]).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", SLOT_COLORS[s])} />
              <span className="text-muted-foreground">{SLOT_LABEL[s]}</span>
            </div>
          ))}
        </div>
      </div>
    </ScreenLayout>
  );
};

export default AdminBrandCalendar;
