import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, CreditCard, AlertCircle, Eye, MousePointerClick, Heart } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { useBrandProfile, useBrandOffers, useBrandOfferTotals, STATUS_LABEL, SLOT_LABEL, deriveBrandOfferStatus, DerivedStatus } from "@/hooks/useBrandOffers";
import { useBrandSubscription } from "@/hooks/useBrandSubscription";
import { format } from "date-fns";

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

const BrandDashboard = () => {
  const nav = useNavigate();
  const { data: profile, isLoading: profileLoading } = useBrandProfile();
  const { data: offers = [], isLoading } = useBrandOffers();
  const { subscription, isActive: subActive, isAdminOverride } = useBrandSubscription();

  const trackedOfferIds = useMemo(
    () => offers.filter((o) => ["live", "paid_scheduled", "ended"].includes(o.status)).map((o) => o.id),
    [offers],
  );
  const { data: totals = {} } = useBrandOfferTotals(trackedOfferIds);

  if (profileLoading || isLoading) return <LoadingDot />;

  const drafts = offers.filter((o) => o.status === "draft");
  const live = offers.filter((o) => ["live", "paid_scheduled", "approved_unpaid", "under_review"].includes(o.status));
  const past = offers.filter((o) => ["ended", "rejected", "cancelled"].includes(o.status));

  const renderOffer = (o: typeof offers[number]) => {
    const t = totals[o.id];
    const placements = o.brand_offer_placements ?? [];
    const slotSet = Array.from(new Set(placements.map((p) => p.slot)));
    const dates = placements.map((p) => p.placement_date).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    const showStats = t && ["live", "paid_scheduled", "ended"].includes(o.status);
    return (
      <button
        key={o.id}
        onClick={() => nav(`/brand/offers/${o.id}`)}
        className="w-full text-left"
      >
        <SurfaceCard className="py-3.5">
          <div className="flex items-start justify-between gap-2">
            <p className="font-display text-[15px] leading-tight flex-1">{o.headline}</p>
            <StatusPill status={o.status} />
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {slotSet.map((s) => (
              <span key={s} className="text-[10px] font-body px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {SLOT_LABEL[s]}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground font-body">
            <span>
              {startDate ? `${format(new Date(startDate), "d MMM")}${endDate && endDate !== startDate ? ` – ${format(new Date(endDate), "d MMM")}` : ""}` : "No dates"}
            </span>
            <span className="font-medium text-foreground">{money(o.total_price_pence)}</span>
          </div>
          {showStats && (
            <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center gap-3 text-[11px] font-body text-foreground/80">
              <span className="inline-flex items-center gap-1"><Eye className="size-3 text-muted-foreground" /> {t.impressions}</span>
              <span className="inline-flex items-center gap-1"><MousePointerClick className="size-3 text-muted-foreground" /> {t.taps}</span>
              <span className="inline-flex items-center gap-1"><Heart className="size-3 text-muted-foreground" /> {t.wishlist_adds}</span>
            </div>
          )}
          {o.status === "approved_unpaid" && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-primary font-body font-medium">
              <CreditCard className="size-3" /> Complete payment to confirm placement
            </div>
          )}
        </SurfaceCard>
      </button>
    );
  };

  return (
    <ScreenLayout>
      <TitleBar title={profile?.brand_name ? `${profile.brand_name} · Brand` : "Brand"} onBack={() => nav("/")} />
      <div className="px-5 pb-8 space-y-5">
        {/* Subscription banner */}
        {!subActive ? (
          <button
            onClick={() => nav("/brand/subscribe")}
            className="w-full text-left rounded-[14px] border border-primary/40 bg-primary/5 p-4 flex items-start gap-3"
          >
            <div className="size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <AlertCircle className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-[14px] font-semibold leading-tight">
                {subscription?.status === "past_due" || subscription?.status === "unpaid"
                  ? "Payment failed — renew to submit new offers"
                  : subscription?.status === "canceled"
                    ? "Membership ended — renew to submit new offers"
                    : "Activate STRAND Brand Access — £99/year"}
              </p>
              <p className="text-[11.5px] text-foreground/70 font-body leading-snug mt-0.5">
                Unlimited campaigns. Placement fees per campaign apply. Existing paid campaigns run to completion.
              </p>
            </div>
          </button>
        ) : (
          <button
            onClick={() => nav("/brand/billing")}
            className="w-full text-left rounded-[12px] border border-border bg-card p-3 flex items-center gap-3"
          >
            <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
              <CreditCard className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-body text-[13px] font-semibold">
                {isAdminOverride ? "Admin access" : "Brand Access active"}
              </p>
              <p className="text-[11px] text-foreground/60 font-body">
                {subscription?.current_period_end && !isAdminOverride
                  ? `${subscription.cancel_at_period_end ? "Ends" : "Renews"} ${format(new Date(subscription.current_period_end), "d MMM yyyy")}`
                  : "Manage billing"}
              </p>
            </div>
            <span className="text-[11px] text-primary font-body">Manage →</span>
          </button>
        )}

        <Button variant="gold" size="pill" onClick={() => nav("/brand/offers/new")} className="w-full">
          <Plus className="size-4 mr-1.5" /> Create new offer
        </Button>

        {drafts.length > 0 && (
          <div>
            <SectionLabel className="!px-0 !mt-0">Drafts</SectionLabel>
            <p className="text-[11px] text-muted-foreground font-body -mt-1 mb-1.5 leading-snug">
              Half-finished offers you can pick back up. Nothing is submitted until you tap Review.
            </p>
            <div className="space-y-2">{drafts.map(renderOffer)}</div>
          </div>
        )}

        <div>
          <SectionLabel className={`!px-0 ${drafts.length > 0 ? "" : "!mt-0"}`}>Live &amp; upcoming</SectionLabel>
          {live.length === 0 ? (
            <EmptyState icon="✦" message="No live offers yet. Create your first placement above." tone="card" />
          ) : (
            <div className="space-y-2">{live.map(renderOffer)}</div>
          )}
        </div>

        {past.length > 0 && (
          <div>
            <SectionLabel className="!px-0">Past offers</SectionLabel>
            <div className="space-y-2">{past.map(renderOffer)}</div>
          </div>
        )}
      </div>
    </ScreenLayout>
  );
};

export default BrandDashboard;
