// Unified brand + pro campaign calendar for the admin hub.
// Month view: each day shows coloured dots by status of campaigns
// booked that day (GREEN=live, ORANGE=scheduled/awaiting, GREY=expired).
// Tapping a day opens a sheet listing every campaign booked on that
// day with the banner thumbnail, submitter, PRO/BRAND tag and slot(s).
import { useEffect, useMemo, useState } from "react";
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
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Rows3 } from "lucide-react";
import SurfaceCard from "@/components/SurfaceCard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import CampaignTypeBadge, { OwnerType } from "@/components/brand/CampaignTypeBadge";
import {
  deriveBrandOfferStatus,
  londonToday,
  PlacementSlot,
  SLOT_LABEL,
} from "@/hooks/useBrandOffers";
import { cn } from "@/lib/utils";

type DayStatus = "live" | "scheduled" | "expired";

const STATUS_DOT: Record<DayStatus, string> = {
  live: "bg-good",
  scheduled: "bg-warn",
  expired: "bg-muted-foreground/50",
};

const STATUS_ORDER: DayStatus[] = ["live", "scheduled", "expired"];

interface PlacementRow {
  id: string;
  slot: PlacementSlot;
  placement_date: string;
  offer_id: string;
  brand_offers: {
    id: string;
    headline: string | null;
    status: string;
    starts_on: string | null;
    ends_on: string | null;
    brand_user_id: string;
    owner_type: string | null;
    hero_image_path: string | null;
  } | null;
}

const statusFor = (offer: PlacementRow["brand_offers"]): DayStatus => {
  if (!offer) return "expired";
  if (offer.status === "under_review" || offer.status === "approved_unpaid") {
    return "scheduled";
  }
  const derived = deriveBrandOfferStatus(
    { status: offer.status, starts_on: offer.starts_on, ends_on: offer.ends_on },
    londonToday(),
  );
  if (derived === "live") return "live";
  if (derived === "ended") return "expired";
  return "scheduled";
};

const HeroThumb = ({ path }: { path: string | null }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let alive = true;
    supabase.storage
      .from("brand-assets")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (alive) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  if (!url) {
    return <div className="size-11 rounded-md bg-muted shrink-0" aria-hidden />;
  }
  return (
    <img
      src={url}
      alt=""
      className="size-11 rounded-md object-cover shrink-0 border border-border/50"
    />
  );
};

const UnifiedCampaignCalendar = ({
  onOpenSlotView,
}: {
  onOpenSlotView?: () => void;
}) => {
  const nav = useNavigate();
  const [month, setMonth] = useState(() => new Date());
  const [openDate, setOpenDate] = useState<string | null>(null);

  const { data: rows = [] } = useQuery({
    queryKey: ["admin", "unified-calendar", format(month, "yyyy-MM")],
    queryFn: async (): Promise<PlacementRow[]> => {
      const start = format(startOfMonth(month), "yyyy-MM-dd");
      const end = format(endOfMonth(month), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("brand_offer_placements")
        .select(
          "id, slot, placement_date, offer_id, brand_offers!inner(id, headline, status, starts_on, ends_on, brand_user_id, owner_type, hero_image_path)",
        )
        .gte("placement_date", start)
        .lte("placement_date", end)
        .in("brand_offers.status", [
          "under_review",
          "approved_unpaid",
          "paid_scheduled",
          "live",
          "ended",
        ]);
      if (error) throw error;
      return (data ?? []) as unknown as PlacementRow[];
    },
  });

  const userIds = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.brand_offers?.brand_user_id && s.add(r.brand_offers.brand_user_id));
    return Array.from(s);
  }, [rows]);

  const { data: names = {} } = useQuery({
    queryKey: ["admin", "unified-calendar", "names", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const [brands, pros] = await Promise.all([
        supabase.from("brand_profiles").select("user_id, brand_name").in("user_id", userIds),
        supabase.from("pro_profiles").select("user_id, display_name").in("user_id", userIds),
      ]);
      const map: Record<string, string> = {};
      (brands.data ?? []).forEach((r) => {
        if (r.user_id) map[r.user_id] = r.brand_name ?? "Brand";
      });
      (pros.data ?? []).forEach((r) => {
        if (r.user_id && !map[r.user_id]) map[r.user_id] = r.display_name ?? "Professional";
      });
      return map;
    },
  });

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);

  const byDate = useMemo(() => {
    const map = new Map<string, PlacementRow[]>();
    rows.forEach((r) => {
      const arr = map.get(r.placement_date) ?? [];
      arr.push(r);
      map.set(r.placement_date, arr);
    });
    return map;
  }, [rows]);

  const dayStatuses = (date: string): DayStatus[] => {
    const entries = byDate.get(date);
    if (!entries || entries.length === 0) return [];
    const set = new Set<DayStatus>();
    entries.forEach((e) => set.add(statusFor(e.brand_offers)));
    return STATUS_ORDER.filter((s) => set.has(s));
  };

  // Group open-day entries by offer so each campaign appears once even if
  // it books multiple slots that day.
  const dayGroups = useMemo(() => {
    if (!openDate) return [] as Array<{
      offer: PlacementRow["brand_offers"];
      slots: PlacementSlot[];
      status: DayStatus;
    }>;
    const entries = byDate.get(openDate) ?? [];
    const map = new Map<string, { offer: PlacementRow["brand_offers"]; slots: Set<PlacementSlot>; status: DayStatus }>();
    entries.forEach((e) => {
      if (!e.brand_offers) return;
      const key = e.brand_offers.id;
      const existing = map.get(key);
      if (existing) {
        existing.slots.add(e.slot);
      } else {
        map.set(key, {
          offer: e.brand_offers,
          slots: new Set([e.slot]),
          status: statusFor(e.brand_offers),
        });
      }
    });
    return Array.from(map.values())
      .map((g) => ({ offer: g.offer, slots: Array.from(g.slots), status: g.status }))
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  }, [openDate, byDate]);

  return (
    <SurfaceCard className="py-3 px-3">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          className="p-1 text-primary"
        >
          <ChevronLeft className="size-4" />
        </button>
        <p className="font-display text-[13px]">{format(month, "MMMM yyyy")}</p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="p-1 text-primary"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[9px] uppercase text-muted-foreground text-center mb-1 font-body">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const statuses = dayStatuses(key);
          const inMonth = isSameMonth(d, month);
          const has = statuses.length > 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => has && setOpenDate(key)}
              disabled={!has}
              className={cn(
                "min-h-[38px] rounded-md border p-1 flex flex-col items-center justify-between text-[10px] font-body transition-colors",
                has ? "border-border cursor-pointer active:scale-[0.97]" : "border-transparent",
                !inMonth && "opacity-40",
                has && !inMonth && "border-border/50",
              )}
              aria-label={has ? `${format(d, "d MMM")} — ${statuses.join(", ")}` : format(d, "d MMM")}
            >
              <span className={cn("font-medium", !has && "text-muted-foreground")}>
                {d.getDate()}
              </span>
              <div className="flex items-center gap-0.5 min-h-[6px]">
                {statuses.map((s) => (
                  <span
                    key={s}
                    className={cn("size-1.5 rounded-full", STATUS_DOT[s])}
                    aria-hidden
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-[10px] font-body text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-good" /> Live</span>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-warn" /> Scheduled</span>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-muted-foreground/50" /> Expired</span>
        </div>
        {onOpenSlotView && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSlotView}
            className="h-6 px-2 text-[10px] font-body text-primary"
          >
            <Rows3 className="size-3 mr-1" /> Slot lanes
          </Button>
        )}
      </div>

      <Sheet open={!!openDate} onOpenChange={(o) => !o && setOpenDate(null)}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-[18px]">
          <SheetHeader>
            <SheetTitle className="font-display text-base">
              {openDate ? format(new Date(openDate), "EEEE d MMMM yyyy") : ""}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-2">
            {dayGroups.length === 0 && (
              <p className="text-[12px] text-muted-foreground font-body">No campaigns booked.</p>
            )}
            {dayGroups.map(({ offer, slots, status }) => {
              if (!offer) return null;
              const owner: OwnerType = offer.owner_type === "pro" ? "pro" : "brand";
              const submitter = names[offer.brand_user_id] ?? (owner === "pro" ? "Professional" : "Brand");
              return (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => {
                    setOpenDate(null);
                    nav(`/admin/brand-offers/${offer.id}`);
                  }}
                  className="w-full text-left"
                >
                  <SurfaceCard className="py-2.5 flex items-start gap-2.5">
                    <HeroThumb path={offer.hero_image_path} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <CampaignTypeBadge ownerType={owner} />
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full font-body font-medium",
                            status === "live" && "bg-good/15 text-good",
                            status === "scheduled" && "bg-warn/20 text-warn",
                            status === "expired" && "bg-muted text-muted-foreground",
                          )}
                        >
                          {status === "live" ? "Live" : status === "scheduled" ? "Scheduled" : "Expired"}
                        </span>
                      </div>
                      <p className="font-display text-[13.5px] leading-tight mt-0.5 truncate">
                        {offer.headline || "Untitled campaign"}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-body mt-0.5 truncate">
                        {submitter}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {slots.map((s) => (
                          <span
                            key={s}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-body"
                          >
                            {SLOT_LABEL[s]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1" />
                  </SurfaceCard>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </SurfaceCard>
  );
};

export default UnifiedCampaignCalendar;
