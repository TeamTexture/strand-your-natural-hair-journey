import { smartBack } from "@/lib/smartBack";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { CreditCard, Edit, Eye, Heart, Loader2, Trash2, Ticket, ExternalLink, Clock, XCircle, Maximize2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useBrandOffer, STATUS_LABEL, SLOT_LABEL, PlacementSlot, useDeleteBrandOffer, deriveBrandOfferStatus,
  usePendingRevision, useAwaitingPaymentRevision, useRevisionUpliftCheckout, useOfferRevisions, useWithdrawBrandOfferRevision, STATS_METHOD_NOTE,
  useRelaunchBrandOffer, useOfferMetrics,

} from "@/hooks/useBrandOffers";
import { supabase } from "@/integrations/supabase/client";
import CountdownClock from "@/components/brand/CountdownClock";
import OfferVisibilityToggle from "@/components/brand/OfferVisibilityToggle";
import { useOwnerMode, ownerHomeRoute, ownerOfferRoute } from "@/hooks/useOwnerMode";
import { useMarkOfferInterestSeen, useOfferInterestCounts } from "@/hooks/useBrandOfferInterest";
import { Users } from "lucide-react";
import { money as baseMoney, TRIAL_PRICING_NOTE } from "@/lib/adPricing";
import TrialPriceTag from "@/components/brand/TrialPriceTag";
import { bandMemberCount, isZeroCount, WIDEN_AUDIENCE_PROMPT } from "@/lib/adTargeting";
import { useOfferReach } from "@/hooks/useAdTargeting";
import { useRoles } from "@/hooks/useRoles";
import {
  EMPTY_METRICS, formatEngagementRate, engagementFigure, IMPRESSION_NOTE, RANGE_NOTE,
} from "@/lib/brandMetrics";

const money = baseMoney;

const BrandOfferDetail = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const ownerMode = useOwnerMode();
  const homeRoute = ownerHomeRoute(ownerMode);
  const editRoute = (oid: string) => `${ownerOfferRoute(ownerMode, oid)}/edit`;
  const { data: offer, isLoading, isFetching, refetch } = useBrandOffer(id);
  const { data: pendingRevision } = usePendingRevision(id);
  const { data: awaitingPaymentRevision } = useAwaitingPaymentRevision(id);
  const upliftCheckout = useRevisionUpliftCheckout();
  const { data: allRevisions = [] } = useOfferRevisions(id);
  const withdrawRevision = useWithdrawBrandOfferRevision();
  const [paying, setPaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [heroOpen, setHeroOpen] = useState(false);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const deleteOffer = useDeleteBrandOffer();
  const relaunch = useRelaunchBrandOffer();
  const markSeen = useMarkOfferInterestSeen();
  const { data: interestMap = {} } = useOfferInterestCounts(id ? [id] : []);
  const interest = id ? interestMap[id] : undefined;
  // Admins see exact performance figures; brands see approximate ranges.
  const { isAdmin } = useRoles();
  const showExact = isAdmin;
  const { data: offerReach } = useOfferReach(id);
  // One query for every figure on this screen — headline, detail and the
  // before/after split all read the same rows.
  const { metrics, dataUpdatedAt: metricsUpdatedAt } = useOfferMetrics(id);
  const [statDetailOpen, setStatDetailOpen] = useState(false);



  // When the owner (or admin) opens an ended offer, clear the "new interest"
  // badge on the past card by stamping brand_last_interest_seen_at = now.
  useEffect(() => {
    if (offer && deriveBrandOfferStatus(offer) === "ended" && (interest?.unread ?? 0) > 0) {
      markSeen.mutate(offer.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id, interest?.unread]);

  useEffect(() => {
    if (!offer?.hero_image_path) { setHeroUrl(null); return; }
    let cancelled = false;
    supabase.storage.from("brand-assets").createSignedUrl(offer.hero_image_path, 60 * 60)
      .then(({ data }) => { if (!cancelled) setHeroUrl(data?.signedUrl ?? null); });
    return () => { cancelled = true; };
  }, [offer?.hero_image_path]);

  if (isLoading || !offer) return <LoadingDot />;

  // Performance is always reported at any audience size. Brands see approximate
  // ranges (banded), admins see exact figures. Figures come from the canonical
  // metrics query — the per-slot brand_offer_stats rows are no longer summed
  // here, because summing a daily rollup double-counts returning members and was
  // the source of the contradictory impression counts.
  const stats = metrics?.all ?? EMPTY_METRICS;
  const statsSuppressed = stats.reach === 0 && stats.raw_views === 0;
  const statsFetchedAt = metricsUpdatedAt ? new Date(metricsUpdatedAt) : null;


  const placements = offer.brand_offer_placements ?? [];
  const bySlot = placements.reduce<Record<string, string[]>>((acc, p) => {
    (acc[p.slot] = acc[p.slot] ?? []).push(p.placement_date);
    return acc;
  }, {});

  const derived = deriveBrandOfferStatus(offer);
  // Live / paid-scheduled offers can be edited too — via the revision flow (no re-payment).
  const canEdit = ["draft", "rejected", "under_review", "paid_scheduled", "live"].includes(offer.status);
  const isRevisionMode = ["paid_scheduled", "live"].includes(offer.status);
  const needsPayment = offer.status === "approved_unpaid";
  // Brands can pull an offer any time BEFORE it's paid/live — including while under review.
  // Live/paid campaigns must be ended, not deleted, so they aren't listed here.
  const canDelete = !["paid_scheduled", "live"].includes(offer.status) && derived !== "live";
  // Most-recent rejected revision (so the brand can see the admin's note).
  const lastRejectedRevision = allRevisions.find((r) => r.status === "rejected");

  const handleDelete = async () => {
    try {
      await deleteOffer.mutateAsync(offer.id);
      toast.success("Offer deleted");
      nav(homeRoute);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const startCheckout = async () => {
    setPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke("brand-checkout", {
        body: { offer_id: offer.id },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
      setPaying(false);
    }
  };

  return (
    <ScreenLayout>
      <TitleBar title={offer.headline ?? "Offer"} onBack={smartBack(nav, homeRoute)} />
      <div className="px-5 pb-8 space-y-4">
        <SurfaceCard className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[9px] uppercase tracking-[0.18em] text-primary font-body font-medium inline-flex items-center gap-1.5">
              {derived === "live" && (
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-good opacity-70 animate-ping" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-good" />
                </span>
              )}
              {STATUS_LABEL[derived]}
            </p>
            {(derived === "live" || derived === "upcoming") && (
              <CountdownClock offer={offer} />
            )}
          </div>
          {(derived === "live" || derived === "upcoming") && (
            <CountdownClock offer={offer} variant="block" />
          )}
          {offer.status === "rejected" && offer.rejection_reason && (
            <p className="text-[12px] text-destructive mt-1">{offer.rejection_reason}</p>
          )}
        </SurfaceCard>

        {heroUrl && (
          <button
            type="button"
            onClick={() => setHeroOpen(true)}
            className="group relative w-full overflow-hidden rounded-2xl border border-border/60 bg-muted/30"
            aria-label="View full banner graphic"
          >
            <img
              src={heroUrl}
              alt={offer.headline ?? "Offer banner"}
              className="w-full h-auto object-cover aspect-[1500/320] block"
              loading="lazy"
            />
            <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/85 backdrop-blur px-2 py-0.5 text-[10px] font-body text-foreground/80 shadow-sm">
              <Maximize2 className="size-3" /> Tap to view full
            </span>
          </button>
        )}

        {offer.body_copy && (
          <SurfaceCard className="py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body">Body copy</p>
            <p className="text-[13px] text-foreground/85 mt-1 whitespace-pre-wrap leading-snug">{offer.body_copy}</p>
          </SurfaceCard>
        )}

        {offer.discount_code && (
          <SurfaceCard className="py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body">Discount code</p>
              {derived === "ended" && (
                <span className="text-[9px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-body font-medium">
                  Expired
                </span>
              )}
            </div>
            <p className={`font-display text-[16px] mt-1 tracking-wider ${derived === "ended" ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {offer.discount_code}
            </p>
          </SurfaceCard>
        )}

        {offer.external_url && (
          <SurfaceCard className="py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body">Advert link</p>
            <a
              href={offer.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-primary font-body break-all hover:underline"
            >
              <ExternalLink className="size-3.5 shrink-0" />
              <span className="break-all">{offer.external_url}</span>
            </a>
          </SurfaceCard>
        )}

        {offer.total_price_pence > 0 && ["paid_scheduled", "live", "ended"].includes(offer.status) && (
          <SurfaceCard className="py-2.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body">Amount paid</p>
              <p className="font-display text-[16px] mt-0.5 flex items-center gap-1.5">
                <span>{money(offer.total_price_pence)}</span>
                <TrialPriceTag />
              </p>
            </div>
            {offer.starts_on && offer.ends_on && (
              <p className="text-[11px] text-muted-foreground font-body text-right">
                {format(new Date(offer.starts_on), "d MMM")} – {format(new Date(offer.ends_on), "d MMM yyyy")}
              </p>
            )}
          </SurfaceCard>
        )}



        {/* Approved but unpaid: the new audience is NOT live. The campaign keeps
          * running on its original targeting and rate until payment lands. */}
        {awaitingPaymentRevision && (
          <SurfaceCard className="bg-warn/5 border-warn/40">
            <div className="flex items-start gap-2.5">
              <Clock className="size-4 text-warn mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-display text-[14px]">Approved — pay to activate</p>
                <p className="text-[11.5px] text-muted-foreground font-body mt-0.5 leading-snug">
                  Your audience change is approved. Targeting costs {money(awaitingPaymentRevision.uplift_pence)} more across the{" "}
                  {awaitingPaymentRevision.remaining_days} day
                  {awaitingPaymentRevision.remaining_days === 1 ? "" : "s"} still to run — days already delivered keep the rate you paid. Pay
                  to apply it; until then your campaign keeps running on its current audience and rate. If it's still unpaid when the campaign
                  ends, the change simply lapses.
                </p>
                <div className="flex gap-1.5 mt-2">
                  <Button
                    variant="gold"
                    size="pill"
                    disabled={upliftCheckout.isPending}
                    onClick={async () => {
                      try {
                        const url = await upliftCheckout.mutateAsync({ revision_id: awaitingPaymentRevision.id });
                        window.location.href = url;
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Checkout could not be started");
                      }
                    }}
                    className="flex-1 text-[11px]"
                  >
                    Pay {money(awaitingPaymentRevision.uplift_pence)}
                  </Button>
                  <Button
                    variant="outline"
                    size="pill"
                    disabled={withdrawRevision.isPending}
                    onClick={async () => {
                      try {
                        await withdrawRevision.mutateAsync({
                          revision_id: awaitingPaymentRevision.id,
                          offer_id: offer.id,
                        });
                        toast.success("Approved audience change discarded");
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Discard failed");
                      }
                    }}
                    className="flex-1 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/5"
                  >
                    Discard
                  </Button>
                </div>
              </div>
            </div>
          </SurfaceCard>
        )}

        {pendingRevision && (
          <SurfaceCard className="bg-warn/5 border-warn/40">
            <div className="flex items-start gap-2.5">
              <Clock className="size-4 text-warn mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-display text-[14px]">Changes under review</p>
                <p className="text-[11.5px] text-muted-foreground font-body mt-0.5 leading-snug">
                  Your original creative is still running to members. When the admin approves your edit, the banner updates on next load —
                  the date window, placements and stats stay the same. No new payment.
                </p>
                <p className="text-[10.5px] text-muted-foreground font-body mt-1">
                  Submitted {format(new Date(pendingRevision.submitted_at), "d MMM · HH:mm")}
                </p>
                <div className="flex gap-1.5 mt-2">
                  <Button variant="outline" size="pill" onClick={() => nav(editRoute(offer.id))} className="flex-1 text-[11px]">
                    Update changes
                  </Button>
                  <Button
                    variant="outline"
                    size="pill"
                    onClick={() => setConfirmWithdraw(true)}
                    disabled={withdrawRevision.isPending}
                    className="flex-1 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/5"
                  >
                    Withdraw
                  </Button>
                </div>
              </div>
            </div>
          </SurfaceCard>
        )}

        {!pendingRevision && lastRejectedRevision?.rejection_reason && (
          <SurfaceCard className="bg-destructive/5 border-destructive/30">
            <div className="flex items-start gap-2.5">
              <XCircle className="size-4 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-display text-[14px]">Last edit rejected</p>
                <p className="text-[11.5px] text-foreground/80 font-body mt-0.5 leading-snug">
                  {lastRejectedRevision.rejection_reason}
                </p>
                <p className="text-[10.5px] text-muted-foreground font-body mt-1">
                  Your original creative is still running. You can submit new changes any time.
                </p>
              </div>
            </div>
          </SurfaceCard>
        )}

        {needsPayment && (
          <SurfaceCard className="bg-primary/5 border-primary/40">
            <p className="font-display text-[15px]">Approved — complete payment to confirm your placement</p>
            <p className="text-[12px] text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5">
              <span>Total {money(offer.total_price_pence)}. Dates are held pending payment.</span>
              <TrialPriceTag />
            </p>
            <p className="text-[10.5px] text-muted-foreground mt-1 leading-snug font-body">
              {TRIAL_PRICING_NOTE} This is the rate your placements were booked at and it will not change.
            </p>
            <Button variant="gold" size="pill" onClick={startCheckout} disabled={paying} className="mt-3 w-full">
              {paying ? <Loader2 className="size-4 animate-spin" /> : <><CreditCard className="size-4 mr-1.5" /> Complete payment</>}
            </Button>
          </SurfaceCard>
        )}

        <SectionLabel className="!px-0">Placements</SectionLabel>
        {Object.entries(bySlot).length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No placements selected.</p>
        ) : Object.entries(bySlot).map(([slot, dates]) => (
          <SurfaceCard key={slot} className="py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-body">
              {SLOT_LABEL[slot as PlacementSlot]}
            </p>
            <p className="text-[12px] mt-1">
              {dates.length} day{dates.length === 1 ? "" : "s"} · {format(new Date(dates.sort()[0]), "d MMM")}
              {dates.length > 1 && ` – ${format(new Date(dates[dates.length - 1]), "d MMM yyyy")}`}
            </p>
          </SurfaceCard>
        ))}

        {offerReach?.is_targeted && (
          <>
            <SectionLabel className="!px-0">Audience</SectionLabel>
            <SurfaceCard className="py-2.5">
              <p className="font-body text-[13px]">
                {showExact ? offerReach.reach ?? "—" : bandMemberCount(offerReach.reach)}
              </p>
              <p className="text-[10.5px] text-muted-foreground font-body mt-1 leading-snug">
                {isZeroCount(offerReach.reach)
                  ? WIDEN_AUDIENCE_PROMPT
                  : showExact
                    ? "Members matching this campaign's targeting."
                    : "An approximate range of members matching this campaign's targeting."}
              </p>
            </SurfaceCard>
          </>
        )}

        <SectionLabel className="!px-0">Performance</SectionLabel>
        {derived === "live" && (
          <SurfaceCard className="py-2.5 flex items-center gap-2.5">
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-70 animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <p className="text-[11.5px] font-body flex-1 min-w-0 leading-snug">
              Live now — figures update automatically
              {statsFetchedAt ? ` · updated ${format(statsFetchedAt, "HH:mm")}` : ""}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-[11px] font-body text-primary inline-flex items-center gap-1 shrink-0"
            >
              <RotateCcw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </SurfaceCard>
        )}
        {statsSuppressed && derived !== "live" ? (
          <SurfaceCard className="py-3">
            <p className="text-[12px] font-body leading-snug">
              Performance figures will appear here as members see your advert.
            </p>
          </SurfaceCard>
        ) : (
          <>
            {/* Four headline figures only. Everything diagnostic sits behind the
                expander so the top of the screen can't contradict itself. */}
            <div className="grid grid-cols-2 gap-2">
              <StatBox icon={Users} label="Reach" value={stats.reach} exact={showExact} />
              <StatBox icon={Maximize2} label="Interactions" value={stats.interactors} exact={showExact} />
              <StatBox icon={Ticket} label="Codes copied" value={stats.code_copies} exact={showExact} />
              <StatBox icon={ExternalLink} label="Link clicks" value={stats.link_clicks} exact={showExact} />
            </div>
            <SurfaceCard className="py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11.5px] font-body text-foreground/80">Engagement rate</p>
                <p className="font-display text-[16px] leading-none">{formatEngagementRate(stats)}</p>
              </div>
              <p className="text-[10.5px] text-muted-foreground font-body mt-1 leading-snug">
                Members who interacted, out of members who saw it. Counted once per member, so it can never pass 100%.
              </p>
            </SurfaceCard>
            <p className="text-[10.5px] text-muted-foreground font-body -mt-1 leading-snug">
              {IMPRESSION_NOTE} Interactions = members who opened it, copied the code, tapped through or saved it.
              {" "}{showExact ? "" : `${RANGE_NOTE} `}{STATS_METHOD_NOTE}
            </p>
            <button
              type="button"
              onClick={() => setStatDetailOpen((v) => !v)}
              className="text-[11.5px] font-body text-primary"
            >
              {statDetailOpen ? "Hide detail" : "Show detail"}
            </button>
            {statDetailOpen && (
              <div className="grid grid-cols-3 gap-2">
                <StatBox icon={Eye} label="Views" value={stats.raw_views} exact={showExact} />
                <StatBox icon={Maximize2} label="Expands" value={stats.expands} exact={showExact} />
                <StatBox icon={Heart} label="Saves" value={stats.wishlist_adds} exact={showExact} />
              </div>
            )}
          </>
        )}

        {/* A mid-campaign audience change is a natural before/after test. Both
            phases come from the same metrics query as the headline figures. */}
        {metrics?.before && metrics.after && (
          <>
            <SectionLabel className="!px-0">Before &amp; after your audience change</SectionLabel>
            <SurfaceCard className="space-y-2.5">
              <p className="text-[11.5px] font-body text-foreground/80 leading-snug">
                Your audience changed on {metrics.changedAt ? format(new Date(metrics.changedAt), "d MMM 'at' HH:mm") : "—"}. Here's how the
                campaign performed either side of that.
              </p>
              {([["before", metrics.before], ["after", metrics.after]] as const).map(([phase, row]) => (
                <div key={phase} className="space-y-1.5">
                  <p className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground font-body">
                    {phase === "before" ? "Before the change" : "Since the change"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <StatBox icon={Users} label="Reach" value={row.reach} exact={showExact} />
                    <StatBox icon={Maximize2} label="Interactions" value={row.interactors} exact={showExact} />
                    <StatBox icon={Ticket} label="Codes copied" value={row.code_copies} exact={showExact} />
                    <StatBox icon={ExternalLink} label="Link clicks" value={row.link_clicks} exact={showExact} />
                  </div>
                  <p className="text-[10.5px] text-muted-foreground font-body">
                    Engagement rate {formatEngagementRate(row)}
                  </p>
                </div>
              ))}
            </SurfaceCard>
          </>
        )}



        {derived === "ended" && (
          <SurfaceCard className="bg-primary/5 border-primary/30">
            <div className="flex items-start gap-2.5">
              <Users className="size-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-display text-[14px]">
                  {interest?.total ?? 0} member{(interest?.total ?? 0) === 1 ? "" : "s"} want this again
                </p>
                <p className="text-[11.5px] text-foreground/70 font-body mt-0.5 leading-snug">
                  {(interest?.total ?? 0) > 0
                    ? "These members asked for this offer to come back. Run it again and we'll let them know."
                    : "No one has asked for this one to come back yet."}
                </p>
                <Button
                  size="pill"
                  className="mt-2.5 h-9 text-[12px]"
                  disabled={relaunch.isPending}
                  onClick={async () => {
                    try {
                      const newId = await relaunch.mutateAsync(offer.id);
                      toast.success("Copied to a new draft — set your dates, then pay to schedule.");
                      nav(editRoute(newId));
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not duplicate this offer");
                    }
                  }}
                >
                  {relaunch.isPending ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <RotateCcw className="size-3.5 mr-1" />}
                  Run this again
                </Button>
              </div>
            </div>
          </SurfaceCard>
        )}


        {allRevisions.length > 0 && (
          <>
            <SectionLabel className="!px-0">Revision history ({allRevisions.length})</SectionLabel>
            {allRevisions.map((r) => {
              const tone =
                r.status === "pending" ? "bg-warn/15 text-warn"
                  : r.status === "approved" ? "bg-good/15 text-good"
                    : r.status === "rejected" ? "bg-destructive/15 text-destructive"
                      : "bg-muted text-muted-foreground";
              const label =
                r.status === "pending" ? "Under review"
                  : r.status === "approved" ? "Approved"
                    : r.status === "rejected" ? "Rejected"
                      : r.status === "withdrawn" ? "Withdrawn"
                        : r.status === "superseded" ? "Superseded"
                          : r.status;
              const stamp = r.reviewed_at ?? r.submitted_at;
              return (
                <SurfaceCard key={r.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-[13px] leading-tight truncate">
                      {r.headline?.trim() || <span className="italic text-muted-foreground">No headline</span>}
                    </p>
                    <span className={`text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-full font-body font-medium ${tone}`}>
                      {label}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground font-body mt-0.5">
                    Submitted {format(new Date(r.submitted_at), "d MMM yyyy · HH:mm")}
                    {r.reviewed_at && r.status !== "pending" && (
                      <> · {label.toLowerCase()} {format(new Date(stamp!), "d MMM · HH:mm")}</>
                    )}
                  </p>
                  {r.rejection_reason && (
                    <p className="text-[11px] text-destructive font-body mt-1 leading-snug">{r.rejection_reason}</p>
                  )}
                </SurfaceCard>
              );
            })}
          </>
        )}


        {(offer.brand_products ?? []).length > 0 && (
          <>
            <SectionLabel className="!px-0">Products</SectionLabel>
            {(offer.brand_products ?? []).map((p) => {
              const thumb = (p.image_urls ?? [])[0];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveProductId(p.id)}
                  className="w-full text-left"
                >
                  <SurfaceCard className="py-2.5 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                    {thumb ? (
                      <img src={thumb} alt={p.name} className="size-12 rounded-md object-cover flex-none bg-muted" />
                    ) : (
                      <div className="size-12 rounded-md bg-muted flex-none" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[14px] leading-tight break-words">{p.name}</p>
                      {p.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>}
                    </div>
                    <Eye className="size-4 text-muted-foreground flex-none" />
                  </SurfaceCard>
                </button>
              );
            })}
          </>
        )}


        {canEdit && !pendingRevision && (
          <Button variant="outline" size="pill" onClick={() => nav(editRoute(offer.id))} className="w-full">
            <Edit className="size-4 mr-1.5" />
            {isRevisionMode ? "Edit creative (submits for review)" : "Edit offer"}
          </Button>
        )}

        <OfferVisibilityToggle
          offerId={offer.id}
          hiddenAt={(offer as { hidden_at?: string | null }).hidden_at ?? null}
        />

        {canDelete && (
          <Button
            variant="outline"
            size="pill"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteOffer.isPending}
            className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
          >
            <Trash2 className="size-4 mr-1.5" /> Delete offer
          </Button>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this offer?</AlertDialogTitle>
            <AlertDialogDescription>
              {offer.status === "under_review"
                ? "This will withdraw the offer from admin review and permanently remove all the copy, images, products and placement dates you added."
                : "This permanently removes the offer copy, images, products and any selected placement dates. You can't undo this."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep offer</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmWithdraw} onOpenChange={setConfirmWithdraw}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw these changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your original creative will keep running to members unchanged. You can submit a new edit at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep pending</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingRevision) return;
                try {
                  await withdrawRevision.mutateAsync({ revision_id: pendingRevision.id, offer_id: offer.id });
                  toast.success("Changes withdrawn");
                  setConfirmWithdraw(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Withdraw failed");
                }
              }}
            >
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={heroOpen} onOpenChange={setHeroOpen}>
        <DialogContent className="max-w-[95vw] desk:max-w-[720px] p-2 bg-background">
          {heroUrl && (
            <img src={heroUrl} alt={offer.headline ?? "Offer banner"} className="w-full h-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
      <ProductInfoDialog
        product={(offer.brand_products ?? []).find((p) => p.id === activeProductId) ?? null}
        onClose={() => setActiveProductId(null)}
      />
    </ScreenLayout>
  );
};

const StatBox = ({ icon: Icon, label, value, exact }: { icon: React.ElementType; label: string; value: number; exact: boolean }) => (
  <SurfaceCard className="text-center py-3">
    <Icon className="size-4 text-primary mx-auto" />
    <p className="font-display text-[15px] mt-1 leading-tight [overflow-wrap:anywhere]">
      {engagementFigure(value, exact)}
    </p>
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
  </SurfaceCard>
);

type BrandProductRow = NonNullable<ReturnType<typeof useBrandOffer>["data"]>["brand_products"][number];

const ProductInfoDialog = ({ product, onClose }: { product: BrandProductRow | null; onClose: () => void }) => {
  const open = !!product;
  const images = product?.image_urls ?? [];
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] desk:max-w-[520px] max-h-[85vh] overflow-y-auto p-4 bg-background">
        {product && (
          <div className="space-y-3">
            {images.length > 0 && (
              <div className="flex gap-2 strand-hscroll -mx-1 px-1">
                {images.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`${product.name} ${i + 1}`}
                    className="size-32 rounded-lg object-cover flex-none bg-muted"
                  />
                ))}
              </div>
            )}
            <div>
              <p className="font-display text-lg leading-tight">{product.name}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
                {product.kind === "tool" ? (product.tool_kind ?? "Tool") : product.kind === "supplement" ? "Supplement" : "Product"}
              </p>
            </div>
            {product.description && (
              <p className="text-[13px] text-foreground/80 whitespace-pre-wrap">{product.description}</p>
            )}
            {product.key_features?.length > 0 && (
              <div>
                <SectionLabel className="!px-0">Key features</SectionLabel>
                <ul className="mt-1 space-y-1 text-[13px] list-disc pl-4">
                  {product.key_features.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}
            {product.materials?.length > 0 && (
              <div>
                <SectionLabel className="!px-0">Materials</SectionLabel>
                <p className="text-[13px] mt-1">{product.materials.join(", ")}</p>
              </div>
            )}
            {product.ingredients && product.ingredients.length > 0 && (
              <div>
                <SectionLabel className="!px-0">Ingredients</SectionLabel>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{product.ingredients.join(", ")}</p>
              </div>
            )}
            {product.external_url && (
              <Button
                asChild
                variant="outline"
                size="pill"
                className="w-full"
              >
                <a href={product.external_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4 mr-1.5" /> Visit product page
                </a>
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BrandOfferDetail;

