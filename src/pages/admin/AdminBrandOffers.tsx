import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarIcon, Check, X, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL, SLOT_LABEL, PlacementSlot, deriveBrandOfferStatus, londonToday, useAllPendingRevisions, useOfferRevisionCounts, useOffersWithPendingRevisions } from "@/hooks/useBrandOffers";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const money = (p: number) => `£${(p / 100).toFixed(2)}`;

const AdminBrandOffers = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const filter = params.get("filter"); // "pending" | "live" | "brands" | null
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
        // Fallback if fk name differs; fetch without join.
        const alt = await supabase.from("brand_offers").select("*, brand_offer_placements(*), brand_products(id)").order("created_at", { ascending: false });
        return alt.data ?? [];
      }
      return data;
    },
  });

  // Pull brand subscription statuses for every brand featured in this list.
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

  if (isLoading) return <LoadingDot />;

  const today = londonToday();
  // Derive display status once per offer so admin agrees with what the brand
  // and consumer are actually seeing.
  const withDerived = offers.map((o) => ({ ...o, _derived: deriveBrandOfferStatus(o, today) }));
  const pending = withDerived.filter((o) => o._derived === "under_review");
  const liveOnly = withDerived.filter((o) => o._derived === "live");
  const other = withDerived.filter((o) => o._derived !== "under_review");

  const showPending = !filter || filter === "pending";
  const showLive = filter === "live" || filter === "brands";
  const showOther = !filter;

  const filterLabel =
    filter === "pending" ? "Offer requests"
      : filter === "live" ? "Live offers"
        : filter === "brands" ? "Live brands"
          : null;

  return (
    <ScreenLayout>
      <TitleBar title={filterLabel ?? "Brand offers"} onBack={() => nav("/admin")} />
      <div className="px-5 pb-8 space-y-4">
        {filter && (
          <button
            onClick={() => nav("/admin/brand-offers")}
            className="text-[11px] text-primary font-body underline underline-offset-2 self-start"
          >
            ← Show all brand offers
          </button>
        )}
        <Button variant="outline" size="pill" onClick={() => nav("/admin/brand-calendar")} className="w-full">
          <CalendarIcon className="size-4 mr-1.5" /> Booking calendar
        </Button>


        {showPending && (
          <>
            <SectionLabel className="!px-0">Pending review ({pending.length})</SectionLabel>
            {pending.length === 0 ? (
              <EmptyState icon="✦" message="No offers pending review." tone="card" />
            ) : pending.map((o) => (
              <SurfaceCard key={o.id} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[15px] leading-tight">{o.headline}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {(o as { brand_profiles?: { brand_name?: string } | null }).brand_profiles?.brand_name ?? "Unknown brand"} · {money(o.total_price_pence)}
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
          </>
        )}

        {showPending && <PendingRevisionsSection />}

        {showLive && (
          <>
            <SectionLabel className="!px-0">
              {filter === "brands" ? "Live brands" : "Live offers"} ({liveOnly.length})
            </SectionLabel>
            {liveOnly.length === 0 ? (
              <EmptyState icon="✦" message="Nothing running today." tone="card" />
            ) : liveOnly.map((o) => (
              <button key={o.id} onClick={() => nav(`/admin/brand-offers/${o.id}`)} className="w-full text-left">
                <SurfaceCard className="py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[14px] leading-tight truncate">{o.headline}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {(o as { brand_profiles?: { brand_name?: string } | null }).brand_profiles?.brand_name ?? "Unknown brand"} · {STATUS_LABEL[o._derived]}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </SurfaceCard>
              </button>
            ))}
          </>
        )}

        {showOther && (
          <>
            <SectionLabel className="!px-0">All offers</SectionLabel>
            {other.map((o) => (
              <button key={o.id} onClick={() => nav(`/admin/brand-offers/${o.id}`)} className="w-full text-left">
                <SurfaceCard className="py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[14px] leading-tight truncate">{o.headline}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {STATUS_LABEL[o._derived]} · {money(o.total_price_pence)}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </SurfaceCard>
              </button>
            ))}
          </>
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

const PendingRevisionsSection = () => {
  const nav = useNavigate();
  const { data: revisions = [] } = useAllPendingRevisions();
  if (revisions.length === 0) return null;
  return (
    <>
      <div className="flex items-center gap-2 pt-1">
        <SectionLabel className="!px-0 !text-destructive">Urgent — pending revisions ({revisions.length})</SectionLabel>
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
      {revisions.map((r) => {
        const offer = (r as unknown as { offer?: { headline?: string; brand_user_id?: string } }).offer;
        return (
          <button key={r.id} onClick={() => nav(`/admin/brand-offers/${r.offer_id}?revision=${r.id}`)} className="w-full text-left">
            <SurfaceCard className="py-2.5 flex items-center gap-2 border-destructive/60 bg-destructive/5 ring-1 ring-destructive/30">
              <div className="flex-1 min-w-0">
                <p className="font-display text-[14px] leading-tight truncate">{r.headline ?? offer?.headline ?? "Revision"}</p>
                <p className="text-[10px] text-muted-foreground">
                  Revision on live ad · submitted {format(new Date(r.submitted_at), "d MMM · HH:mm")}
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
    </>
  );
};

export default AdminBrandOffers;
