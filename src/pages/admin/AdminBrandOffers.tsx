import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Check, X, CreditCard, Eye, MousePointerClick, Heart, Ticket, ExternalLink, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import LiveOfferCard from "@/components/brand/LiveOfferCard";
import PastOfferCard from "@/components/brand/PastOfferCard";
import CountdownClock from "@/components/brand/CountdownClock";
import { useOfferInterestCounts } from "@/hooks/useBrandOfferInterest";
import CampaignTypeBadge, { OwnerType } from "@/components/brand/CampaignTypeBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_LABEL, SLOT_LABEL, PlacementSlot, deriveBrandOfferStatus, DerivedStatus,
  useAllPendingRevisions, useOfferRevisionCounts, useOffersWithPendingRevisions,
  useBrandOfferTotals,
} from "@/hooks/useBrandOffers";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const money = (p: number) => `£${(p / 100).toFixed(2)}`;

const StatusPill = ({ status }: { status: DerivedStatus }) => {
  const tone =
    status === "live" ? "bg-good/15 text-good" :
    status === "upcoming" ? "bg-primary/15 text-primary" :
    status === "under_review" ? "bg-warn/15 text-warn" :
    status === "approved_unpaid" ? "bg-primary/15 text-primary" :
    status === "ended" ? "bg-muted text-muted-foreground" :
    status === "rejected" || status === "cancelled" ? "bg-destructive/10 text-destructive" :
    "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 rounded-full font-body font-medium ${tone}`}>
      {status === "live" && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-good opacity-70 animate-ping" />
          <span className="relative inline-flex size-1.5 rounded-full bg-good" />
        </span>
      )}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
};

const AdminBrandOffers = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter"); // "pending" | "live" | "brands" | null
  const typeFilter = (params.get("type") as OwnerType | null) ?? null;
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["admin", "brand-offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_offers")
        .select("*, brand_profiles!brand_offers_brand_user_id_fkey(brand_name), brand_offer_placements(*), brand_products(id)")
        .order("submitted_at", { ascending: false, nullsFirst: false });
      if (error) {
        const alt = await supabase.from("brand_offers").select("*, brand_offer_placements(*), brand_products(id)").order("created_at", { ascending: false });
        return alt.data ?? [];
      }
      return data;
    },
  });

  // Resolve professional display names for pro-owned campaigns so the
  // submitter is always visible next to the campaign title.
  const proUserIds = Array.from(new Set(
    offers
      .filter((o) => (o as { owner_type?: string }).owner_type === "pro")
      .map((o) => (o as { brand_user_id?: string }).brand_user_id)
      .filter((v): v is string => !!v),
  ));
  const { data: proNamesById = {} } = useQuery({
    queryKey: ["admin", "brand-offers", "pro-names", proUserIds.sort().join(",")],
    enabled: proUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("pro_profiles")
        .select("user_id, display_name")
        .in("user_id", proUserIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r) => { if (r.user_id) map[r.user_id] = r.display_name ?? "Professional"; });
      return map;
    },
  });

  const brandIds = Array.from(new Set(offers.map((o) => (o as { brand_user_id?: string }).brand_user_id).filter((v): v is string => !!v)));
  const { data: subsById = {} } = useQuery({
    queryKey: ["admin", "brand-subscriptions", brandIds.sort().join(",")],
    enabled: brandIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            in: (col: string, arr: string[]) => Promise<{ data: Array<{ brand_user_id: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean }> | null }>;
          };
        };
      })
        .from("brand_subscriptions")
        .select("brand_user_id,status,current_period_end,cancel_at_period_end")
        .in("brand_user_id", brandIds);
      const map: Record<string, { status: string; current_period_end: string | null; cancel_at_period_end: boolean }> = {};
      (data ?? []).forEach((r) => { map[r.brand_user_id] = r; });
      return map;
    },
  });

  const subBadge = (brandUserId: string | undefined) => {
    if (!brandUserId) return null;
    const s = subsById[brandUserId];
    if (!s) return { label: "No subscription", tone: "muted" as const };
    const active = ["active", "trialing"].includes(s.status) && (!s.current_period_end || new Date(s.current_period_end) > new Date());
    if (active) {
      const until = s.current_period_end ? ` · until ${format(new Date(s.current_period_end), "d MMM yyyy")}` : "";
      return { label: `Active${until}`, tone: "good" as const };
    }
    if (s.status === "past_due" || s.status === "unpaid") return { label: "Past due", tone: "warn" as const };
    if (s.status === "canceled") return { label: "Cancelled", tone: "muted" as const };
    return { label: s.status, tone: "muted" as const };
  };

  const approve = async (id: string) => {
    const { error } = await supabase
      .from("brand_offers")
      .update({ status: "approved_unpaid", approved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Approved — brand can now pay");
    qc.invalidateQueries({ queryKey: ["admin", "brand-offers"] });
    qc.invalidateQueries({ queryKey: ["admin", "pending-brand-offers"] });
  };

  const reject = async () => {
    if (!rejectFor) return;
    const { error } = await supabase
      .from("brand_offers")
      .update({ status: "rejected", rejected_at: new Date().toISOString(), rejection_reason: rejectReason.trim() || null })
      .eq("id", rejectFor);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    setRejectFor(null);
    setRejectReason("");
    qc.invalidateQueries({ queryKey: ["admin", "brand-offers"] });
    qc.invalidateQueries({ queryKey: ["admin", "pending-brand-offers"] });
  };

  const allIds = offers.map((o) => o.id);
  const { data: revisionCounts = {} } = useOfferRevisionCounts(allIds);
  const { data: pendingRevSet = new Set<string>() } = useOffersWithPendingRevisions(allIds);

  // Derive display status once per offer.
  const withDerived = useMemo(
    () => offers.map((o) => ({ ...o, _derived: deriveBrandOfferStatus(o) })),
    [offers],
  );

  // Split by campaign type so we can build filters + counts.
  const ownerOf = (o: { owner_type?: string | null }): OwnerType =>
    (o.owner_type === "pro" ? "pro" : "brand");

  const typeFiltered = useMemo(
    () => (typeFilter ? withDerived.filter((o) => ownerOf(o) === typeFilter) : withDerived),
    [withDerived, typeFilter],
  );

  const trackedOfferIds = useMemo(
    () => typeFiltered.filter((o) => ["live", "upcoming", "ended"].includes(o._derived)).map((o) => o.id),
    [typeFiltered],
  );
  const { data: totals = {} } = useBrandOfferTotals(trackedOfferIds);
  const pastIdsForInterest = useMemo(
    () => typeFiltered.filter((o) => ["ended", "rejected", "cancelled"].includes(o._derived)).map((o) => o.id),
    [typeFiltered],
  );
  const { data: interestCounts = {} } = useOfferInterestCounts(pastIdsForInterest);

  if (isLoading) return <LoadingDot />;

  const drafts = typeFiltered.filter((o) => o._derived === "draft");
  const underReview = typeFiltered.filter((o) => o._derived === "under_review");
  const awaitingPayment = typeFiltered.filter((o) => o._derived === "approved_unpaid");
  const liveNow = typeFiltered.filter((o) => o._derived === "live");
  const upcoming = typeFiltered.filter((o) => o._derived === "upcoming");
  const past = typeFiltered.filter((o) => ["ended", "rejected", "cancelled"].includes(o._derived));

  // Full-set (unfiltered by type) counts for filter chips.
  const chipCounts = {
    all: withDerived.length,
    brand: withDerived.filter((o) => ownerOf(o) === "brand").length,
    pro: withDerived.filter((o) => ownerOf(o) === "pro").length,
  };

  const showAll = !filter;
  const showPending = showAll || filter === "pending";
  const showLive = showAll || filter === "live" || filter === "brands";
  const showOther = showAll || filter === "past";
  const showPastOnly = filter === "past";

  const filterLabel =
    filter === "pending" ? "Campaign requests"
      : filter === "live" ? "Live campaigns"
        : filter === "brands" ? "Live brands"
          : filter === "past" ? "Past campaigns"
            : null;

  const submitterOf = (o: typeof withDerived[number]): string => {
    const owner = ownerOf(o);
    const brandUserId = (o as { brand_user_id?: string }).brand_user_id;
    if (owner === "pro") {
      return brandUserId ? (proNamesById[brandUserId] ?? "Professional") : "Professional";
    }
    return (o as { brand_profiles?: { brand_name?: string } | null }).brand_profiles?.brand_name ?? "Unknown brand";
  };

  const updateType = (t: OwnerType | null) => {
    const next = new URLSearchParams(params);
    if (t) next.set("type", t); else next.delete("type");
    setParams(next, { replace: true });
  };

  const renderOffer = (o: typeof withDerived[number]) => {
    const t = totals[o.id];
    const placements = o.brand_offer_placements ?? [];
    const slotSet = Array.from(new Set(placements.map((p) => p.slot)));
    const dates = placements.map((p) => p.placement_date).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    const showStats = t && ["live", "upcoming", "ended"].includes(o._derived);
    return (
      <button
        key={o.id}
        onClick={() => nav(`/admin/brand-offers/${o.id}`)}
        className="w-full text-left"
      >
        <SurfaceCard className="py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <CampaignTypeBadge ownerType={ownerOf(o)} />
                <p className="font-display text-[15px] leading-tight truncate">{o.headline || "Untitled campaign"}</p>
              </div>
              <p className="text-[11px] text-muted-foreground font-body mt-0.5">
                {submitterOf(o)} · {money(o.total_price_pence)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <StatusPill status={o._derived} />
              {(o._derived === "live" || o._derived === "upcoming") && (
                <CountdownClock offer={o} />
              )}
              {pendingRevSet.has(o.id) ? (
                <span className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-body font-medium">
                  Revision pending
                </span>
              ) : revisionCounts[o.id] ? (
                <span className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full bg-muted text-foreground/70 font-body font-medium">
                  Revised · {revisionCounts[o.id]}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {slotSet.map((s) => (
              <span key={s} className="text-[10px] font-body px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {SLOT_LABEL[s as PlacementSlot]}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground font-body">
            <span>
              {o._derived === "upcoming" && startDate
                ? `Starts ${format(new Date(startDate), "d MMM")}`
                : startDate
                  ? `${format(new Date(startDate), "d MMM")}${endDate && endDate !== startDate ? ` – ${format(new Date(endDate), "d MMM")}` : ""}`
                  : "No dates"}
            </span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </div>
          {showStats && (
            <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] font-body text-foreground/80">
              <span className="inline-flex items-center gap-1" title="Impressions"><Eye className="size-3 text-muted-foreground" /> {t.impressions}</span>
              <span className="inline-flex items-center gap-1" title="Taps (banner opens)"><MousePointerClick className="size-3 text-muted-foreground" /> {t.taps}</span>
              <span className="inline-flex items-center gap-1" title="Code copies"><Ticket className="size-3 text-muted-foreground" /> {t.code_copies}</span>
              <span className="inline-flex items-center gap-1" title="Link clicks (visit offer)"><ExternalLink className="size-3 text-muted-foreground" /> {t.link_clicks}</span>
              <span className="inline-flex items-center gap-1" title="Wishlist adds"><Heart className="size-3 text-muted-foreground" /> {t.wishlist_adds}</span>
            </div>
          )}
          {o._derived === "approved_unpaid" && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-primary font-body font-medium">
              <CreditCard className="size-3" /> Awaiting brand payment
            </div>
          )}
        </SurfaceCard>
      </button>
    );
  };

  return (
    <ScreenLayout>
      <TitleBar title={filterLabel ?? "Brand offers"} onBack={smartBack(nav, "/admin")} />
      <div className="px-5 pb-8 space-y-5">
        {/* Status filter — All / Pending / Live / Past */}
        <div className="flex items-center gap-1.5 flex-wrap" role="tablist" aria-label="Filter by status">
          {([
            { key: null, label: "All" },
            { key: "pending" as const, label: `Pending · ${underReview.length}` },
            { key: "live" as const, label: `Live · ${liveNow.length}` },
            { key: "past" as const, label: `Past · ${past.length}` },
          ]).map((chip) => {
            const active = filter === chip.key || (chip.key === null && !filter);
            return (
              <button
                key={chip.label}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  if (chip.key) next.set("filter", chip.key); else next.delete("filter");
                  setParams(next, { replace: true });
                }}
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-body font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
        <Button variant="outline" size="pill" onClick={() => nav("/admin/brand-calendar")} className="w-full">
          <CalendarIcon className="size-4 mr-1.5" /> Booking calendar
        </Button>

        {/* Campaign type filter — All / Brand / Pro */}
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Filter by campaign type">
          {([
            { key: null, label: "All", count: chipCounts.all },
            { key: "brand" as const, label: "Brand", count: chipCounts.brand },
            { key: "pro" as const, label: "Pro", count: chipCounts.pro },
          ]).map((chip) => {
            const active = typeFilter === chip.key;
            return (
              <button
                key={chip.label}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => updateType(chip.key)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-body font-medium transition-colors",
                  active
                    ? chip.key === "pro"
                      ? "bg-primary text-primary-foreground"
                      : chip.key === "brand"
                        ? "bg-foreground text-background"
                        : "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {chip.label}
                <span className={cn("text-[10px] opacity-80", active ? "" : "")}>· {chip.count}</span>
              </button>
            );
          })}
        </div>

        {showPending && (
          <div>
            <SectionLabel className="!px-0">Pending review ({underReview.length})</SectionLabel>
            {underReview.length === 0 ? (
              <EmptyState icon="✦" message="No offers pending review." tone="card" />
            ) : (
              <div className="space-y-2">
                {underReview.map((o) => (
                  <SurfaceCard key={o.id} className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <CampaignTypeBadge ownerType={ownerOf(o)} />
                          <p className="font-display text-[15px] leading-tight truncate">{o.headline || "Untitled campaign"}</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {submitterOf(o)} · {money(o.total_price_pence)}
                        </p>
                        {(() => {
                          const b = subBadge((o as { brand_user_id?: string }).brand_user_id);
                          if (!b) return null;
                          const cls = b.tone === "good"
                            ? "bg-good/15 text-good"
                            : b.tone === "warn"
                              ? "bg-warn/20 text-warn"
                              : "bg-muted text-muted-foreground";
                          return (
                            <span className={`inline-block mt-1 text-[9.5px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded font-body ${cls}`}>
                              Brand access · {b.label}
                            </span>
                          );
                        })()}
                      </div>
                      <StatusPill status={o._derived} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(new Set((o.brand_offer_placements ?? []).map((p) => p.slot))).map((s) => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-body">
                          {SLOT_LABEL[s as PlacementSlot]}
                        </span>
                      ))}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-body">
                        {(o.brand_offer_placements ?? []).length} days
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-body">
                        {(o.brand_products ?? []).length} product{(o.brand_products ?? []).length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="pill" onClick={() => nav(`/admin/brand-offers/${o.id}`)} className="flex-1 text-[12px]">
                        Review
                      </Button>
                      <Button variant="gold" size="pill" onClick={() => approve(o.id)} className="flex-1 text-[12px]">
                        <Check className="size-3.5 mr-1" /> Approve
                      </Button>
                      <Button variant="outline" size="pill" onClick={() => setRejectFor(o.id)} className="text-[12px]">
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </SurfaceCard>
                ))}
              </div>
            )}
          </div>
        )}

        {showPending && (
          <PendingRevisionsSection
            ownerInfo={Object.fromEntries(
              withDerived.map((o) => [o.id, { owner: ownerOf(o), submitter: submitterOf(o) }]),
            )}
            typeFilter={typeFilter}
          />
        )}

        {showAll && awaitingPayment.length > 0 && (
          <div>
            <SectionLabel className="!px-0">Awaiting payment</SectionLabel>
            <div className="space-y-2">{awaitingPayment.map(renderOffer)}</div>
          </div>
        )}

        {showLive && (
          <div>
            <SectionLabel className="!px-0">
              {filter === "brands" ? "Live brands" : "Live"} ({liveNow.length})
            </SectionLabel>
            {liveNow.length === 0 ? (
              <EmptyState icon="✦" message="Nothing running today." tone="card" />
            ) : (
              <div className="space-y-3">
                {liveNow.map((o) => {
                  const placements = o.brand_offer_placements ?? [];
                  const dates = placements.map((p) => p.placement_date).sort();
                  return (
                    <div key={o.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 px-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <CampaignTypeBadge ownerType={ownerOf(o)} />
                          <p className="text-[10.5px] uppercase tracking-[0.14em] font-body text-muted-foreground truncate">
                            {submitterOf(o)}
                          </p>
                        </div>
                        <CountdownClock offer={o} />
                      </div>
                      <LiveOfferCard
                        id={o.id}
                        headline={o.headline}
                        heroImagePath={o.hero_image_path}
                        slots={placements.map((p) => p.slot)}
                        startDate={dates[0]}
                        endDate={dates[dates.length - 1]}
                        totals={totals[o.id]}
                        hasPendingRevision={pendingRevSet.has(o.id)}
                        revisionCount={revisionCounts[o.id]}
                        onReview={() => nav(`/admin/brand-offers/${o.id}`)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {showAll && upcoming.length > 0 && (
          <div>
            <SectionLabel className="!px-0">Upcoming</SectionLabel>
            <div className="space-y-2">{upcoming.map(renderOffer)}</div>
          </div>
        )}

        {showAll && drafts.length > 0 && (
          <div>
            <SectionLabel className="!px-0">Drafts</SectionLabel>
            <div className="space-y-2">{drafts.map(renderOffer)}</div>
          </div>
        )}

        {showOther && past.length > 0 && (
          <div>
            <SectionLabel className="!px-0">Past</SectionLabel>
            <div className="grid grid-cols-1 gap-2.5">
              {past.map((o) => {
                const placements = o.brand_offer_placements ?? [];
                const dates = placements.map((p) => p.placement_date).sort();
                const interest = interestCounts[o.id];
                return (
                  <PastOfferCard
                    key={o.id}
                    headline={o.headline}
                    heroImagePath={o.hero_image_path}
                    slots={placements.map((p) => p.slot)}
                    startDate={dates[0]}
                    endDate={dates[dates.length - 1]}
                    totals={totals[o.id]}
                    submitter={submitterOf(o)}
                    amountPaidPence={o.total_price_pence}
                    interestTotal={interest?.total ?? 0}
                    interestUnread={interest?.unread ?? 0}
                    onOpen={() => nav(`/admin/brand-offers/${o.id}`)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject offer</DialogTitle></DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason (shown to brand)" rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button variant="gold" onClick={reject}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenLayout>
  );
};

const PendingRevisionsSection = ({
  ownerInfo,
  typeFilter,
}: {
  ownerInfo: Record<string, { owner: OwnerType; submitter: string }>;
  typeFilter: OwnerType | null;
}) => {
  const nav = useNavigate();
  const { data: revisions = [] } = useAllPendingRevisions();
  const filtered = revisions.filter((r) => {
    if (!typeFilter) return true;
    const info = ownerInfo[r.offer_id];
    return info ? info.owner === typeFilter : true;
  });
  if (filtered.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 pt-1">
        <SectionLabel className="!px-0 !text-destructive">Urgent — pending revisions ({filtered.length})</SectionLabel>
        <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground font-body font-semibold">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-destructive-foreground opacity-70 animate-ping" />
            <span className="relative inline-flex size-1.5 rounded-full bg-destructive-foreground" />
          </span>
          Review now
        </span>
      </div>
      <p className="text-[11px] text-destructive/80 font-body -mt-1 leading-snug">
        Live campaigns with creative edits awaiting review. The original creative stays live until you approve — approve or reject promptly.
      </p>
      {filtered.map((r) => {
        const offer = (r as unknown as { offer?: { headline?: string; brand_user_id?: string } }).offer;
        const info = ownerInfo[r.offer_id];
        return (
          <button key={r.id} onClick={() => nav(`/admin/brand-offers/${r.offer_id}?revision=${r.id}`)} className="w-full text-left">
            <SurfaceCard className="py-2.5 flex items-center gap-2 border-destructive/60 bg-destructive/5 ring-1 ring-destructive/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {info && <CampaignTypeBadge ownerType={info.owner} />}
                  <p className="font-display text-[14px] leading-tight truncate">{r.headline ?? offer?.headline ?? "Revision"}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {info?.submitter ? `${info.submitter} · ` : ""}Revision on live ad · submitted {format(new Date(r.submitted_at), "d MMM · HH:mm")}
                </p>
              </div>
              <span className="text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground font-body font-semibold">
                Urgent
              </span>
              <ChevronRight className="size-4 text-destructive" />
            </SurfaceCard>
          </button>
        );
      })}
    </div>
  );
};

export default AdminBrandOffers;
