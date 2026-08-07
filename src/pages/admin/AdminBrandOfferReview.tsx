import { smartBack } from "@/lib/smartBack";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Check, X, Pause, ExternalLink, Maximize2, Rocket, Eye, MousePointerClick, Ticket, Heart, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import UrlValue from "@/components/admin/UrlValue";
import { useMarkAdminEntityRead } from "@/hooks/useAdminNotifications";
import SectionLabel from "@/components/SectionLabel";
import LoadingDot from "@/components/LoadingDot";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import CountdownClock from "@/components/brand/CountdownClock";
import CampaignTypeBadge, { OwnerType } from "@/components/brand/CampaignTypeBadge";

import {
  useBrandOffer, STATUS_LABEL, SLOT_LABEL, STAT_SLOT_LABEL, PlacementSlot, deriveBrandOfferStatus,
  usePendingRevision, useApproveBrandOfferRevision, useRejectBrandOfferRevision,
  useBrandOfferTotals,
  STATS_METHOD_NOTE,
  BrandOfferRevision,
} from "@/hooks/useBrandOffers";
import { useOfferInterestCounts } from "@/hooks/useBrandOfferInterest";
import { useQueryClient } from "@tanstack/react-query";

const StatBox = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) => (
  <SurfaceCard className="text-center py-3">
    <Icon className="size-4 text-primary mx-auto" />
    <p className="font-display text-xl mt-1">{value}</p>
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
  </SurfaceCard>
);


const money = (p: number) => `£${(p / 100).toFixed(2)}`;

const useSignedUrl = (path: string | null | undefined) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    supabase.storage.from("brand-assets").createSignedUrl(path, 60 * 60).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  return url;
};

const cleanValue = (value: string | null | undefined) => (value ?? "").trim();

const ChangeField = ({ label, value }: { label: string; value: string | null | undefined }) => {
  return (
    <div className="rounded-[10px] border border-warn/40 bg-warn/5 p-2.5">
      <p className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground font-body">{label} changed to</p>
      <p className={`text-[12px] font-body leading-snug mt-1 ${cleanValue(value) ? "" : "text-muted-foreground italic"}`}>
        {cleanValue(value) || "Removed"}
      </p>
    </div>
  );
};

const arraysMatch = (a: unknown[] = [], b: unknown[] = []) =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

const RevisionDiff = ({ offer, revision }: {
  offer: NonNullable<ReturnType<typeof useBrandOffer>["data"]>;
  revision: BrandOfferRevision;
}) => {
  const qc = useQueryClient();
  const markEntityRead = useMarkAdminEntityRead();

  const approve = useApproveBrandOfferRevision();
  const reject = useRejectBrandOfferRevision();
  const [rejectReason, setRejectReason] = useState("");
  const afterHero = useSignedUrl(revision.hero_image_path ?? offer.hero_image_path);
  const heroChanged = (revision.hero_image_path ?? null) !== (offer.hero_image_path ?? null);
  const beforeProducts = offer.brand_products ?? [];
  const afterProducts = revision.products ?? [];
  const textChanges = [
    { label: "Headline", before: offer.headline, after: revision.headline },
    { label: "Body copy", before: offer.body_copy, after: revision.body_copy },
    { label: "Discount code", before: offer.discount_code, after: revision.discount_code },
    { label: "Advert link", before: offer.external_url, after: revision.external_url },
  ].filter((field) => cleanValue(field.before) !== cleanValue(field.after));
  const changedProducts = afterProducts.filter((product, index) => {
    const current = beforeProducts[index];
    if (!current) return true;
    return (
      cleanValue(current.name) !== cleanValue(product.name) ||
      cleanValue(current.description) !== cleanValue(product.description) ||
      cleanValue(current.external_url) !== cleanValue(product.external_url) ||
      !arraysMatch(current.image_urls ?? [], product.image_urls ?? []) ||
      !arraysMatch(current.ingredients ?? [], product.ingredients ?? []) ||
      cleanValue((current as typeof current & { tool_kind?: string | null }).tool_kind) !== cleanValue(product.tool_kind) ||
      !arraysMatch((current as typeof current & { key_features?: string[] | null }).key_features ?? [], product.key_features ?? []) ||
      !arraysMatch((current as typeof current & { materials?: string[] | null }).materials ?? [], product.materials ?? [])
    );
  });
  const productsChanged = changedProducts.length > 0 || beforeProducts.length !== afterProducts.length;
  const hasChanges = heroChanged || textChanges.length > 0 || productsChanged;

  return (
    <>
      <SurfaceCard className="bg-warn/5 border-warn/40 space-y-1">
        <p className="font-display text-[15px]">Pending revision</p>
        <p className="text-[11.5px] text-foreground/80 font-body leading-snug">
          Submitted {format(new Date(revision.submitted_at), "d MMM · HH:mm")}. Approve = new creative replaces what members see on next
          load. Reject = original creative continues running. No payment, dates unchanged, stats continue on the same offer.
        </p>
      </SurfaceCard>

      <SectionLabel className="!px-0">Changes made</SectionLabel>

      {!hasChanges && (
        <SurfaceCard className="py-2.5">
          <p className="text-[12px] text-muted-foreground font-body">No creative change was detected. Reject this revision or ask the brand to resubmit with updates.</p>
        </SurfaceCard>
      )}

      {heroChanged && (
        <div className="rounded-[10px] border border-warn/40 bg-warn/5 p-2.5">
          <p className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground font-body">Banner image changed to</p>
          {afterHero ? <img src={afterHero} alt="Updated advert banner" className="w-full aspect-[16/9] object-cover rounded mt-2" /> : <div className="aspect-[16/9] bg-muted rounded mt-2" />}
        </div>
      )}

      {textChanges.map((field) => (
        <ChangeField key={field.label} label={field.label} value={field.after} />
      ))}

      {productsChanged && (
        <>
          <SectionLabel className="!px-0">Attached products / tools changed to</SectionLabel>
          <SurfaceCard>
            <ul className="space-y-2">
              {afterProducts.length === 0 && <li className="text-[12px] text-muted-foreground italic">All attached products removed</li>}
              {afterProducts.map((p, i) => (
                <li key={`${p.name}-${i}`} className="text-[12px] font-body leading-snug">
                  <span className="font-medium">{p.name}</span>
                  {p.description && <span className="text-muted-foreground"> — {p.description}</span>}
                </li>
              ))}
            </ul>
          </SurfaceCard>
        </>
      )}

      <SectionLabel className="!px-0">Decision</SectionLabel>
      <div className="space-y-2">
        <Button
          variant="gold"
          size="pill"
          onClick={async () => {
            try {
              await approve.mutateAsync({ revision_id: revision.id, offer_id: offer.id });
              void markEntityRead("brand_offer_revision", revision.id);
              toast.success("Revision approved — creative updated");
              qc.invalidateQueries({ queryKey: ["brand-offer", offer.id] });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Approve failed");
            }
          }}
          className="w-full"
        >
          <Check className="size-4 mr-1.5" /> Approve revision
        </Button>
        <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason (shown to brand)" rows={2} />
        <Button
          variant="outline"
          size="pill"
          onClick={async () => {
            try {
              await reject.mutateAsync({ revision_id: revision.id, offer_id: offer.id, reason: rejectReason.trim() || null });
              void markEntityRead("brand_offer_revision", revision.id);
              toast.success("Revision rejected");
              qc.invalidateQueries({ queryKey: ["brand-offer", offer.id] });
              setRejectReason("");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Reject failed");
            }
          }}
          className="w-full"
        >
          <X className="size-4 mr-1.5" /> Reject revision
        </Button>
      </div>
    </>
  );
};

const AdminBrandOfferReview = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const revisionMode = params.get("revision") !== null;
  const { data: offer, isLoading } = useBrandOffer(id);
  const markOfferRead = useMarkAdminEntityRead();
  const { data: pendingRevision } = usePendingRevision(id);
  const { data: totalsMap = {} } = useBrandOfferTotals(id ? [id] : []);
  const { data: interestMap = {} } = useOfferInterestCounts(id ? [id] : []);

  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [heroOpen, setHeroOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [submitterName, setSubmitterName] = useState<string | null>(null);
  // Default to TODAY (Europe/London) so an admin relaunch is visible to users
  // immediately — the active-offer query filters on starts_on <= today.
  const londonToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const [relaunchStart, setRelaunchStart] = useState<string>(londonToday);
  const [relaunchDays, setRelaunchDays] = useState<number>(7);
  const [relaunching, setRelaunching] = useState(false);

  useEffect(() => {
    if (id) void markOfferRead("brand_offer", id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const ownerType: OwnerType = ((offer as { owner_type?: string | null } | undefined)?.owner_type === "pro" ? "pro" : "brand");
  const brandUserId = (offer as { brand_user_id?: string | null } | undefined)?.brand_user_id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!brandUserId) { setSubmitterName(null); return; }
    (async () => {
      if (ownerType === "pro") {
        const { data } = await supabase
          .from("pro_profiles")
          .select("display_name")
          .eq("user_id", brandUserId)
          .maybeSingle();
        if (!cancelled) setSubmitterName((data as { display_name?: string } | null)?.display_name ?? "Professional");
      } else {
        const { data } = await supabase
          .from("brand_profiles")
          .select("brand_name")
          .eq("user_id", brandUserId)
          .maybeSingle();
        if (!cancelled) setSubmitterName((data as { brand_name?: string } | null)?.brand_name ?? "Brand");
      }
    })();
    return () => { cancelled = true; };
  }, [brandUserId, ownerType]);



  useEffect(() => {
    if (offer?.hero_image_path) {
      supabase.storage.from("brand-assets").createSignedUrl(offer.hero_image_path, 60 * 60).then(({ data }) => {
        setHeroUrl(data?.signedUrl ?? null);
      });
    }
  }, [offer?.hero_image_path]);

  if (isLoading || !offer) return <LoadingDot />;

  const setStatus = async (status: string, extra: Record<string, unknown> = {}) => {
    const { error } = await supabase.from("brand_offers").update({ status: status as never, ...extra }).eq("id", offer.id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    qc.invalidateQueries({ queryKey: ["brand-offer", offer.id] });
    qc.invalidateQueries({ queryKey: ["admin", "brand-offers"] });
  };

  /** Admin-only free relaunch: reuse the offer's original slot mix (or `home`
   *  as a fallback) and insert new zero-cost placements starting on the chosen
   *  date. No payment, no revision — status flips straight back to scheduled/live.
   *
   *  Idempotent by design: dates this offer already holds are skipped (the
   *  no-overlap trigger would otherwise reject the whole batch and nothing
   *  would go live), and dates held by a DIFFERENT live/scheduled offer are
   *  reported instead of aborting the relaunch. */
  const adminRelaunch = async () => {
    if (!offer) return;
    const days = Math.max(1, Math.min(60, Number(relaunchDays) || 0));
    if (!relaunchStart || !days) {
      toast.error("Pick a start date and a number of days");
      return;
    }
    setRelaunching(true);
    try {
      const originalSlots = Array.from(new Set((offer.brand_offer_placements ?? []).map((p) => p.slot)));
      const slots = originalSlots.length ? originalSlots : ["home"];
      const [y, m, d] = relaunchStart.split("-").map(Number);
      const dates: string[] = [];
      for (let i = 0; i < days; i++) {
        dates.push(new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + i)).toISOString().slice(0, 10));
      }
      const endDate = dates[dates.length - 1];

      // Dates this offer already covers — skip, never re-insert.
      const { data: mine } = await supabase
        .from("brand_offer_placements")
        .select("slot, placement_date")
        .eq("offer_id", offer.id)
        .gte("placement_date", relaunchStart)
        .lte("placement_date", endDate);
      const mineKeys = new Set((mine ?? []).map((r) => `${r.slot}|${r.placement_date}`));

      // Dates other active offers already hold — report, don't abort.
      const { data: others } = await supabase
        .from("brand_offer_placements")
        .select("slot, placement_date, offer_id, brand_offers!inner(status)")
        .in("slot", slots as never)
        .gte("placement_date", relaunchStart)
        .lte("placement_date", endDate)
        .in("brand_offers.status", ["under_review", "approved_unpaid", "paid_scheduled", "live"]);
      const blocked = new Set(
        (others ?? [])
          .filter((r) => (r as { offer_id: string }).offer_id !== offer.id)
          .map((r) => `${r.slot}|${r.placement_date}`),
      );

      const rows: Array<{ offer_id: string; slot: string; placement_date: string; daily_rate_pence: number }> = [];
      for (const date of dates) {
        for (const slot of slots) {
          const key = `${slot}|${date}`;
          if (mineKeys.has(key) || blocked.has(key)) continue;
          rows.push({ offer_id: offer.id, slot, placement_date: date, daily_rate_pence: 0 });
        }
      }

      if (rows.length) {
        const { error: pErr } = await supabase
          .from("brand_offer_placements")
          .insert(rows as unknown as never);
        if (pErr) throw pErr;
      }

      // Nothing bookable at all in the window — stop before flipping status so
      // the offer never reads "Live" without a placement to render from.
      if (!rows.length && mineKeys.size === 0) {
        toast.error("Every day in that window is already booked by another advert");
        return;
      }

      // If the relaunch starts today (or earlier), flip straight to `live` so
      // dashboards + status pills reflect it immediately. Future starts stay
      // `paid_scheduled` until the day arrives.
      const nextStatus = relaunchStart <= londonToday ? "live" : "paid_scheduled";
      const { error: oErr } = await supabase
        .from("brand_offers")
        .update({
          status: nextStatus as never,
          starts_on: relaunchStart,
          ends_on: endDate,
          rejected_at: null,
          rejection_reason: null,
          // Present the relaunch to the brand exactly like a fresh approval +
          // payment so their dashboard shows it under Live with metrics.
          approved_at: new Date().toISOString(),
          paid_at: new Date().toISOString(),
        })
        .eq("id", offer.id);
      if (oErr) throw oErr;

      // Verify it really is servable today — a live status with no placement on
      // today's date renders nothing to consumers.
      let warning: string | null = null;
      if (nextStatus === "live") {
        const { count } = await supabase
          .from("brand_offer_placements")
          .select("id", { count: "exact", head: true })
          .eq("offer_id", offer.id)
          .eq("placement_date", londonToday);
        if (!count) warning = "Relaunched, but no placement exists for today — it will start on the first free day";
      }

      const skipped = blocked.size;
      if (warning) {
        toast.warning(warning);
      } else {
        toast.success(
          `Relaunched free for ${days} day${days === 1 ? "" : "s"}${skipped ? ` — ${skipped} day${skipped === 1 ? "" : "s"} skipped (already booked)` : ""}`,
        );
      }
      qc.invalidateQueries({ queryKey: ["brand-offer", offer.id] });
      qc.invalidateQueries({ queryKey: ["admin", "brand-offers"] });
      qc.invalidateQueries({ queryKey: ["active-brand-offer"] });
      qc.invalidateQueries({ queryKey: ["all-live-brand-offers"] });
      qc.invalidateQueries({ queryKey: ["brand-placements-taken"] });
      qc.invalidateQueries({ queryKey: ["admin", "unified-calendar"] });
      qc.invalidateQueries({ queryKey: ["admin", "brand-calendar"] });

    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Relaunch failed");
    } finally {
      setRelaunching(false);
    }
  };

  // Cross-member totals (SECURITY DEFINER RPC — admins see every offer), with a
  // fallback to the offer's own stat rows if the RPC returns nothing yet.
  const rowStats = (offer.brand_offer_stats ?? []) as Array<{
    slot: string | null; impressions: number | null; expands: number | null;
    wishlist_adds: number | null; code_copies: number | null; link_clicks: number | null;
  }>;
  const rowTotals = rowStats.reduce(
    (acc, s) => ({
      impressions: acc.impressions + (s.impressions ?? 0),
      expands: acc.expands + (s.expands ?? 0),
      wishlist_adds: acc.wishlist_adds + (s.wishlist_adds ?? 0),
      code_copies: acc.code_copies + (s.code_copies ?? 0),
      link_clicks: acc.link_clicks + (s.link_clicks ?? 0),
    }),
    { impressions: 0, expands: 0, wishlist_adds: 0, code_copies: 0, link_clicks: 0 },
  );
  const stats = (id ? totalsMap[id] : undefined) ?? rowTotals;
  const interestTotal = (id ? interestMap[id]?.total : 0) ?? 0;

  const slotStats = Object.values(
    rowStats.reduce<Record<string, { slot: string; impressions: number; expands: number; link_clicks: number }>>((acc, s) => {
      const key = s.slot ?? "other";
      const entry = (acc[key] = acc[key] ?? { slot: key, impressions: 0, expands: 0, link_clicks: 0 });
      entry.impressions += s.impressions ?? 0;
      entry.expands += s.expands ?? 0;
      entry.link_clicks += s.link_clicks ?? 0;
      return acc;
    }, {}),
  );

  const placements = offer.brand_offer_placements ?? [];

  const bySlot = placements.reduce<Record<string, string[]>>((acc, p) => {
    (acc[p.slot] = acc[p.slot] ?? []).push(p.placement_date);
    return acc;
  }, {});

  // If admin arrived from the "Pending revisions" queue OR a revision is
  // pending for this offer, prioritise the diff view.
  const showRevisionDiff = pendingRevision && (revisionMode || pendingRevision);

  return (
    <ScreenLayout>
      <TitleBar title={showRevisionDiff ? "Review revision" : "Review offer"} onBack={smartBack(nav, "/admin/brand-offers")} />
      <div className="px-5 pb-8 space-y-4">
        {showRevisionDiff ? (
          <RevisionDiff offer={offer} revision={pendingRevision!} />
        ) : (
          <>
            <SurfaceCard padded={false} className="overflow-hidden">
              {heroUrl ? (
                <button
                  type="button"
                  onClick={() => setHeroOpen(true)}
                  className="relative w-full block group"
                  aria-label="View full advert graphic"
                >
                  <img src={heroUrl} alt="" className="w-full aspect-[16/9] object-cover" />
                  <span className="absolute top-2 right-2 rounded-full bg-background/80 backdrop-blur px-2 py-1 text-[10px] font-body inline-flex items-center gap-1 opacity-90 group-hover:opacity-100">
                    <Maximize2 className="size-3" /> View full
                  </span>
                </button>
              ) : null}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-primary font-body font-medium inline-flex items-center gap-1.5">{deriveBrandOfferStatus(offer) === "live" && (<span className="relative flex size-1.5"><span className="absolute inline-flex h-full w-full rounded-full bg-good opacity-70 animate-ping" /><span className="relative inline-flex size-1.5 rounded-full bg-good" /></span>)}{STATUS_LABEL[deriveBrandOfferStatus(offer)]}</p>
                  {["live", "upcoming"].includes(deriveBrandOfferStatus(offer)) && (
                    <CountdownClock offer={offer} />
                  )}
                </div>
                {["live", "upcoming"].includes(deriveBrandOfferStatus(offer)) && (
                  <div className="mt-2"><CountdownClock offer={offer} variant="block" /></div>
                )}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <CampaignTypeBadge ownerType={ownerType} />
                  {submitterName && (
                    <p className="text-[10.5px] uppercase tracking-[0.14em] font-body text-muted-foreground truncate">
                      {submitterName}
                    </p>
                  )}
                </div>
                {offer.headline && <p className="font-display text-lg mt-1">{offer.headline}</p>}
                {offer.body_copy && <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{offer.body_copy}</p>}
                {offer.discount_code && <p className="text-[11px] text-primary mt-2 font-body">Code {offer.discount_code}</p>}
              </div>
            </SurfaceCard>

            {offer.external_url && (
              <SurfaceCard className="py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Advert link</p>
                <div className="text-[12px] mt-0.5 min-w-0">
                  <UrlValue url={offer.external_url} label="Advert link" />
                </div>
              </SurfaceCard>
            )}

            <Dialog open={heroOpen} onOpenChange={setHeroOpen}>
              <DialogContent className="max-w-[95vw] p-0 bg-transparent border-0 shadow-none">
                {heroUrl && <img src={heroUrl} alt="Full advert graphic" className="w-full h-auto rounded-lg" />}
              </DialogContent>
            </Dialog>


            <SurfaceCard className="py-2.5">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total value</p>
              <p className="font-display text-xl">{money(offer.total_price_pence)}</p>
            </SurfaceCard>

            <SectionLabel className="!px-0">Performance</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              <StatBox icon={Eye} label="Impressions" value={stats.impressions} />
              <StatBox icon={Maximize2} label="Expands" value={stats.expands} />
              <StatBox icon={Ticket} label="Code copies" value={stats.code_copies} />
              <StatBox icon={ExternalLink} label="Link clicks" value={stats.link_clicks} />
              <StatBox icon={Heart} label="Wishlist" value={stats.wishlist_adds} />
              <StatBox icon={Users} label="Interest" value={interestTotal} />
            </div>
            <p className="text-[10.5px] text-muted-foreground font-body leading-snug">
              Impressions = distinct members who saw the advert (at least half of it, for a full second).
              Expands = advert opened. Code copies = discount code copied. Link clicks = tapped through to the
              advertiser's site. Interest = members who registered interest after the campaign ended.
              {STATS_METHOD_NOTE}
            </p>

            {slotStats.length > 0 && (
              <SurfaceCard className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">By placement</p>
                {slotStats.map((s) => (
                  <div key={s.slot} className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-body truncate">
                      {STAT_SLOT_LABEL[s.slot] ?? "Other"}
                    </p>
                    <p className="text-[11px] font-body text-muted-foreground shrink-0">
                      {s.impressions} views · {s.expands} expands · {s.link_clicks} clicks
                    </p>
                  </div>
                ))}
              </SurfaceCard>
            )}



            <SectionLabel className="!px-0">Placements</SectionLabel>
            {Object.entries(bySlot).map(([slot, dates]) => (
              <SurfaceCard key={slot} className="py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{STAT_SLOT_LABEL[slot] ?? "Other"}</p>
                <p className="text-[12px] mt-0.5">
                  {dates.length} day{dates.length === 1 ? "" : "s"} · {format(new Date(dates.sort()[0]), "d MMM yyyy")}
                </p>
              </SurfaceCard>
            ))}

            {(offer.brand_products ?? []).length > 0 && (
              <>
                <SectionLabel className="!px-0">Products &amp; AI drafts</SectionLabel>
                {(offer.brand_products ?? []).map((p) => (
                  <SurfaceCard key={p.id} className="space-y-1">
                    <p className="font-display text-[14px]">{p.name}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {p.source_type === "ai" ? "AI-drafted from " + (p.source_url ?? "URL") : p.source_type}
                    </p>
                    {p.description && <p className="text-[12px] text-muted-foreground leading-snug">{p.description}</p>}
                    {p.ingredients && p.ingredients.length > 0 && (
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        <span className="uppercase tracking-wider">Ingredients:</span> {p.ingredients.slice(0, 8).join(", ")}
                        {p.ingredients.length > 8 && "…"}
                      </p>
                    )}
                  </SurfaceCard>
                ))}
              </>
            )}

            <SectionLabel className="!px-0">Actions</SectionLabel>
            {offer.status === "under_review" && (
              <div className="space-y-2">
                <Button variant="gold" size="pill" onClick={() => setStatus("approved_unpaid", { approved_at: new Date().toISOString() })} className="w-full">
                  <Check className="size-4 mr-1.5" /> Approve
                </Button>
                <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason (shown to brand)" rows={2} />
                <Button variant="outline" size="pill" onClick={() => setStatus("rejected", { rejected_at: new Date().toISOString(), rejection_reason: rejectReason.trim() || null })} className="w-full">
                  <X className="size-4 mr-1.5" /> Reject
                </Button>
              </div>
            )}
            {["paid_scheduled", "live"].includes(offer.status) && (
              <Button variant="outline" size="pill" onClick={() => setStatus("ended", { ends_on: new Date().toISOString().slice(0, 10) })} className="w-full">
                <Pause className="size-4 mr-1.5" /> End early
              </Button>
            )}
            {offer.status === "approved_unpaid" && (
              <div className="space-y-2">
                <Button variant="gold" size="pill" onClick={goLiveWithoutPayment} disabled={relaunching} className="w-full">
                  <Rocket className="size-4 mr-1.5" /> {relaunching ? "Working…" : "Make live — no payment"}
                </Button>
                <p className="text-[11px] text-muted-foreground font-body leading-snug">
                  Admin override: skips Stripe entirely and puts this advert live on its
                  booked dates at £0.
                </p>
                <Button variant="outline" size="pill" onClick={() => setStatus("cancelled")} className="w-full">
                  Cancel (release dates)
                </Button>
              </div>
            )}

            {["ended", "rejected", "cancelled"].includes(deriveBrandOfferStatus(offer)) && (
              <SurfaceCard className="space-y-2 border-primary/30 bg-primary/5">
                <div className="flex items-start gap-2.5">
                  <div className="size-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Rocket className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-[14.5px] leading-tight">Relaunch free (admin)</p>
                    <p className="text-[11.5px] text-foreground/80 font-body leading-snug mt-1">
                      Puts this offer back live using its original slots at £0 for the
                      dates you pick. No brand payment, no revision review.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-body">Start date</span>
                    <Input type="date" value={relaunchStart} onChange={(e) => setRelaunchStart(e.target.value)} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-body">Days</span>
                    <Input type="number" min={1} max={60} value={relaunchDays} onChange={(e) => setRelaunchDays(Number(e.target.value))} />
                  </label>
                </div>
                <Button variant="gold" size="pill" onClick={adminRelaunch} disabled={relaunching} className="w-full">
                  <Rocket className="size-4 mr-1.5" /> {relaunching ? "Relaunching…" : "Relaunch free"}
                </Button>
              </SurfaceCard>
            )}
          </>
        )}
      </div>
    </ScreenLayout>
  );
};

export default AdminBrandOfferReview;
