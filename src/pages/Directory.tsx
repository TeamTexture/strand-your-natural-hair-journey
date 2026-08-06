import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUp, Search, Star, Pencil, Clock, ChevronDown, MapPin, Phone, Mail, Tag, UserPlus, Stethoscope, Droplet } from "lucide-react";
import ScreenLayout from "@/components/ScreenLayout";
import TitleBar from "@/components/TitleBar";
import SurfaceCard from "@/components/SurfaceCard";
import EmptyState from "@/components/EmptyState";
import LoadingDot from "@/components/LoadingDot";
import ProAvatar from "@/components/ProAvatar";
import EnquiryDialog from "@/components/EnquiryDialog";
import ExternalEnquiryDialog from "@/components/ExternalEnquiryDialog";
import { buildTrackedUrl, logReferralClick } from "@/lib/referrals";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { anchorProps } from "@/lib/scrollMemory";
import { searchProfessionalsIn, type ProType, type Professional } from "@/data/professionals";
import { useDirectoryProfessionals } from "@/hooks/useDirectoryProfessionals";
import { useProContactStates, proContactStatusLine } from "@/hooks/useProContactState";
import ProContactAction from "@/components/directory/ProContactAction";
import StarRating from "@/components/StarRating";
import { useReviewSummaries } from "@/hooks/useReviews";
import DirectoryReviewPreview from "@/components/DirectoryReviewPreview";
import { normalizeWebsiteUrl } from "@/lib/socialLinks";
import { summariseOpeningHours, listOpeningHours } from "@/lib/openingHours";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import { allowsMemberFeatures, allowsProFeatures } from "@/lib/viewFeatures";
import CapabilityBadges from "@/components/pro/CapabilityBadges";

const tabs: Array<"All" | ProType> = ["All", "Trichologist", "Dermatologist", "Curl Specialist"];

/** Verified-capability filters. Both read `_verified` state only. */
const CAP_FILTERS = [
  { key: "doctor" as const, label: "Doctors" },
  { key: "bloods" as const, label: "Can take bloods" },
];

const Directory = () => {
  const [params, setParams] = useSearchParams();
  const bloodOnly = params.get("bloodOnly") === "1";
  const fromConsultation = params.get("consultation") === "1";
  const anchorSelf = params.get("self") === "1";
  const proParam = params.get("pro");

  const { user } = useAuth();
  // Effective target for anchoring: explicit ?pro= wins, otherwise ?self=1
  // resolves to the current user's own listing.
  const targetProUserId = proParam ?? (anchorSelf && user?.id ? user.id : null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof tabs)[number]>(bloodOnly ? "Dermatologist" : "All");
  const [query, setQuery] = useState("");
  const { pros, loading } = useDirectoryProfessionals();
  const { stateForListing } = useProContactStates();
  // Hard wall: in the Professional / Brand / Admin views the directory is
  // read-only. No member enquiry state, no member chat, no member bottom nav.
  const roleView = useActiveRoleView();
  const memberActions = allowsMemberFeatures(roleView);
  // Booking a professional is not a member-only feature: professionals are also
  // end users and must be able to enquire with their peers.
  const canEnquire = memberActions || allowsProFeatures(roleView);

  const navigate = useNavigate();
  const [showTop, setShowTop] = useState(false);
  const [enquiryTarget, setEnquiryTarget] = useState<{
    proUserId: string | null;
    proProfileId: string | null;
    name: string;
  } | null>(null);
  const [externalEnquiryTarget, setExternalEnquiryTarget] = useState<{
    name: string;
    directoryId: string | null;
    proUserId: string | null;
  } | null>(null);
  const [expandedHours, setExpandedHours] = useState<Record<string, boolean>>({});
  const [expandedSalons, setExpandedSalons] = useState<Record<string, boolean>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Verified-capability filters. Never sticky in the URL, cleared on tab change.
  const [caps, setCaps] = useState<{ doctor: boolean; bloods: boolean }>({
    doctor: false,
    bloods: false,
  });

  const results = useMemo(() => {
    const base = searchProfessionalsIn(pros, query, bloodOnly ? "Dermatologist" : tab);
    return base.filter(
      (p) =>
        (!caps.doctor || p.isDoctorVerified === true) &&
        (!caps.bloods || p.canTakeBloodsVerified === true),
    );
  }, [pros, query, tab, bloodOnly, caps]);

  // Chip counts come from the FULL live directory (`pros` = published,
  // unsuspended pro profiles + active curated rows), never from the filtered
  // result set — so chips don't flicker as search/other filters change.
  // A category with zero listings is not rendered at all.
  const tabCounts = useMemo(() => {
    const counts = {} as Record<ProType, number>;
    for (const p of pros) counts[p.type] = (counts[p.type] ?? 0) + 1;
    return counts;
  }, [pros]);

  // Same zero-count rule as the category chips: a capability filter that would
  // return nothing is not rendered. Counts are VERIFIED-only.
  const capCounts = useMemo(
    () => ({
      doctor: pros.filter((p) => p.isDoctorVerified === true).length,
      bloods: pros.filter((p) => p.canTakeBloodsVerified === true).length,
    }),
    [pros],
  );

  // Never leave the user stranded on a filter that has emptied out.
  useEffect(() => {
    setCaps((c) => ({
      doctor: c.doctor && capCounts.doctor > 0,
      bloods: c.bloods && capCounts.bloods > 0,
    }));
  }, [capCounts.doctor, capCounts.bloods]);

  const visibleTabs = useMemo(
    () => tabs.filter((t) => t === "All" || (tabCounts[t] ?? 0) > 0),
    [tabCounts],
  );

  // If the active category empties out, fall back to All so the list isn't
  // stuck on a chip that no longer exists.
  useEffect(() => {
    if (tab !== "All" && (tabCounts[tab] ?? 0) === 0) setTab("All");
  }, [tab, tabCounts]);

  // Aggregate approved-review ratings for every listed platform pro. Pros with
  // no approved reviews are absent from the map, so nothing is rendered.
  const proUserIds = useMemo(
    () => pros.map((p) => p.proUserId).filter((id): id is string => !!id),
    [pros],
  );
  const { data: reviewSummaries } = useReviewSummaries(proUserIds);


  // Resolve the target listing for anchoring. Covers both the owner's own
  // "view my listing" flow (?self=1) and any deep link to another pro via
  // ?pro=<userId>. Owner styling (star + Edit) is still driven off `user.id`
  // matching the card's `proUserId`, so it flows through automatically.
  const ownedListing: Professional | null = useMemo(() => {
    if (!user) return null;
    return pros.find((p) => p.proUserId && p.proUserId === user.id) ?? null;
  }, [pros, user]);

  const targetListing: Professional | null = useMemo(() => {
    if (!targetProUserId) return null;
    return pros.find((p) => p.proUserId === targetProUserId) ?? null;
  }, [pros, targetProUserId]);

  // Robustly anchor to the target card once the directory data has rendered.
  // Because pros load async, and the card ref is set via a callback during
  // render, we poll briefly for the node before giving up. Uses block:'start'
  // with scroll-mt-24 on the card to clear the sticky header, then triggers
  // a short highlight pulse so the eye finds the correct row.
  const anchoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!targetProUserId) return;
    // Only anchor once per target — after that the user is free to filter
    // and scroll without being yanked back to the card.
    if (anchoredFor.current === targetProUserId) return;
    // Wait until the pros list has finished loading before deciding whether
    // the target exists — avoids a false "not listed" toast on cold load.
    if (loading) return;
    if (!targetListing) {
      anchoredFor.current = targetProUserId;
      toast("This professional is no longer listed");
      const next = new URLSearchParams(params);
      next.delete("pro");
      next.delete("self");
      setParams(next, { replace: true });
      return;
    }
    anchoredFor.current = targetProUserId;
    // If a filter/search is hiding the target, clear both so the card
    // becomes visible before we try to scroll.
    if (!results.some((r) => r.id === targetListing.id)) {
      setTab("All");
      setQuery("");
    }
    let cancelled = false;
    let attempts = 0;
    const tryScroll = () => {
      if (cancelled) return;
      const node = cardRefs.current[targetListing.id];
      if (node) {
        node.scrollIntoView({ block: "start", behavior: "smooth" });
        setHighlightId(targetListing.id);
        // Highlight pulse fades after a couple of seconds.
        setTimeout(() => setHighlightId((cur) => (cur === targetListing.id ? null : cur)), 2500);
        return;
      }
      if (attempts++ < 40) setTimeout(tryScroll, 100);
    };
    tryScroll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetProUserId, targetListing, loading]);


  useEffect(() => {
    const main = document.querySelector("main") as HTMLElement | null;
    if (!main) return;
    const onScroll = () => setShowTop(main.scrollTop > 400);
    main.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    const main = document.querySelector("main") as HTMLElement | null;
    main?.scrollTo({ top: 0, behavior: "smooth" });
  };

  /**
   * GROUPING. Solo professionals (salon_id null) are untouched — same single
   * card as before. A salon with two or more published stylists collapses into
   * one group card; a ONE-stylist salon deliberately renders as a normal single
   * card, because an expander over a single name is noise.
   */
  const filterActive =
    query.trim().length > 0 ||
    (!bloodOnly && tab !== "All") ||
    caps.doctor ||
    caps.bloods;

  const rows = useMemo(() => {
    const rosterBySalon = new Map<string, Professional[]>();
    for (const p of pros) {
      if (!p.salonId) continue;
      const list = rosterBySalon.get(p.salonId) ?? [];
      list.push(p);
      rosterBySalon.set(p.salonId, list);
    }
    const out: DirectoryRow[] = [];
    const seenSalons = new Set<string>();
    for (const p of results) {
      if (!p.salonId) {
        out.push({ kind: "solo", pro: p });
        continue;
      }
      if (seenSalons.has(p.salonId)) continue;
      seenSalons.add(p.salonId);
      const roster = rosterBySalon.get(p.salonId) ?? [p];
      if (roster.length <= 1) {
        out.push({ kind: "solo", pro: roster[0] ?? p });
        continue;
      }
      out.push({
        kind: "salon",
        salonId: p.salonId,
        salonName: p.salonName ?? p.clinic,
        city: p.salonCity ?? null,
        roster,
        matched: results.filter((r) => r.salonId === p.salonId),
      });
    }
    return out;
  }, [pros, results]);

  /**
   * ONE card renderer for every listing — solo pro, curated row, or a stylist
   * inside an expanded salon group. There is deliberately no second card
   * component: a salon stylist must read exactly like any other professional.
   */
  const renderProCard = (p: Professional) => {
    const contact = stateForListing(p);
    const hasContact = contact.kind !== "none" || !!contact.threadId;
    const statusLine = proContactStatusLine(contact, (iso) =>
      formatDistanceToNow(new Date(iso), { addSuffix: true }),
    );

    const enqLabel =
      contact.kind === "accepted" ? "Accepted"
      : contact.kind === "pending" ? "Enquiry sent"
      : contact.kind === "declined" ? "Declined"
      : "Withdrawn";
    const enqCls =
      contact.kind === "accepted" ? "bg-good/15 text-good"
      : contact.kind === "pending" ? "bg-warn/15 text-warn"
      : "bg-muted text-muted-foreground";

    const isOwn = !!user && !!p.proUserId && p.proUserId === user.id;
    const ratingSummary = p.proUserId ? reviewSummaries?.get(p.proUserId) : undefined;
    const openingSummary = summariseOpeningHours(p.openingHours);
    const hoursOpen = expandedHours[p.id] === true;
    const fullHours = hoursOpen ? listOpeningHours(p.openingHours) : [];
    const addressParts = [p.addressLine1, p.addressLine2, p.city, p.location]
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0);
    // Dedupe address vs the standing "location" line so we don't
    // repeat the same postcode twice on very compact profiles.
    const streetLine = addressParts.slice(0, addressParts.length - 1).join(", ");
    const cityLine = addressParts[addressParts.length - 1];

    return (
    <SurfaceCard
      key={p.id}
      {...anchorProps(p.id)}
      padded={false}
      ref={(el) => { cardRefs.current[p.id] = el; }}
      className={cn(
        "overflow-hidden scroll-mt-24 transition-shadow duration-500",
        // Owner-view distinct treatment: deeper sand tone using the
        // existing secondary/primary token family. Everyone else sees
        // the standard white card.
        isOwn && "bg-secondary/70 border-primary/40 ring-1 ring-primary/25",
        // Brief highlight pulse when the user has been deep-linked
        // to this card so the eye finds the row after the scroll.
        highlightId === p.id && "ring-2 ring-primary shadow-[0_0_0_6px_hsl(var(--primary)/0.18)] animate-pulse",
      )}
    >

      <div className="p-4">
        <div className="flex gap-3">
          <ProAvatar name={p.name} photoUrl={p.photoUrl} size="size-[52px]" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {isOwn && (
                  <Star
                    className="size-3.5 text-primary shrink-0"
                    fill="currentColor"
                    aria-label="Your listing"
                  />
                )}
                <p className="font-display text-base font-semibold leading-tight truncate">
                  {p.name}
                </p>
              </div>
              {isOwn ? (
                <button
                  type="button"
                  onClick={() => navigate("/pro/profile")}
                  className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] px-2 py-1 rounded-full bg-primary text-primary-foreground"
                >
                  <Pencil className="size-3" />
                  Edit
                </button>
              ) : hasContact ? (
                <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${enqCls}`}>
                  {enqLabel}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="text-[11px] text-muted-foreground">{p.title}</span>
              <span className="bg-good/15 text-good text-[10px] font-medium px-1.5 py-0.5 rounded">
                {p.verified} ✓
              </span>
              {/* Verified capabilities only — claims never render. */}
              <CapabilityBadges
                caps={{
                  isDoctorVerified: p.isDoctorVerified,
                  canTakeBloodsVerified: p.canTakeBloodsVerified,
                  bloodsSetting: p.bloodsSetting ?? null,
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className="text-[11px] text-muted-foreground min-w-0 flex-1">
                {p.clinic}{p.location ? ` · ${p.location}` : ""}
              </p>
              {ratingSummary && (
                <button
                  type="button"
                  onClick={() => navigate(`/directory/${p.proUserId}/reviews`)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5"
                  aria-label={`${ratingSummary.avg_rating} out of 5 from ${ratingSummary.review_count} reviews`}
                >
                  <StarRating value={ratingSummary.avg_rating} size="size-3" />
                  <span className="text-[10px] font-body font-semibold">
                    {ratingSummary.avg_rating.toFixed(1)}
                  </span>
                  <span className="text-[10px] font-body text-muted-foreground">
                    ({ratingSummary.review_count})
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {p.specs.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {p.specs.map((s) => (
              <span
                key={s}
                className="bg-primary/10 text-foreground text-[10px] px-2 py-1 rounded-full"
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {p.bio && (
          <p className="text-[11px] text-foreground/80 leading-relaxed mt-3">{p.bio}</p>
        )}

        {p.proUserId && ratingSummary && (
          <DirectoryReviewPreview proUserId={p.proUserId} />
        )}

        {/* Progressive disclosure: opening hours + address + contact.
            Summarised inline; full week expands on tap. */}
        {(openingSummary || streetLine || cityLine || p.businessPhone || p.businessEmail) && (
          <div className="mt-3 rounded-[10px] border border-border/70 bg-background/60 divide-y divide-border/60">
            {openingSummary && (
              <button
                type="button"
                onClick={() =>
                  setExpandedHours((cur) => ({ ...cur, [p.id]: !cur[p.id] }))
                }
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
                aria-expanded={hoursOpen}
              >
                <Clock className="size-3.5 text-primary shrink-0" />
                <span className="text-[11px] font-body text-foreground/85 flex-1">
                  {openingSummary}
                </span>
                <ChevronDown
                  className={cn(
                    "size-3.5 text-muted-foreground transition-transform",
                    hoursOpen && "rotate-180",
                  )}
                />
              </button>
            )}
            {hoursOpen && fullHours.length > 0 && (
              <ul className="px-3 pb-2 pt-1 space-y-0.5">
                {fullHours.map((row) => (
                  <li
                    key={row.label}
                    className={cn(
                      "flex items-center justify-between text-[11px] font-body",
                      row.isToday ? "text-foreground font-medium" : "text-foreground/75",
                    )}
                  >
                    <span>{row.label}</span>
                    <span>{row.value}</span>
                  </li>
                ))}
              </ul>
            )}
            {(streetLine || cityLine) && (
              <div className="flex items-start gap-2 px-3 py-2">
                <MapPin className="size-3.5 text-primary shrink-0 mt-0.5" />
                <div className="text-[11px] font-body text-foreground/85 leading-snug">
                  {streetLine && <div>{streetLine}</div>}
                  {cityLine && cityLine !== streetLine && <div>{cityLine}</div>}
                </div>
              </div>
            )}
            {p.businessPhone && (
              <a
                href={`tel:${p.businessPhone.replace(/\s+/g, "")}`}
                className="flex items-center gap-2 px-3 py-2 text-[11px] font-body text-foreground/85"
              >
                <Phone className="size-3.5 text-primary shrink-0" />
                <span className="truncate">{p.businessPhone}</span>
              </a>
            )}
            {p.businessEmail && (
              <a
                href={`mailto:${p.businessEmail}`}
                className="flex items-center gap-2 px-3 py-2 text-[11px] font-body text-foreground/85"
              >
                <Mail className="size-3.5 text-primary shrink-0" />
                <span className="truncate">{p.businessEmail}</span>
              </a>
            )}
          </div>
        )}

        {memberActions && statusLine && (
          <p className="text-[11px] text-muted-foreground mt-3">{statusLine}</p>
        )}

        {/* Owner's own listing: no enquiry actions, but if a client
            thread exists on this listing it stays reachable. */}
        {memberActions && isOwn && contact.threadId && (
          <ProContactAction state={contact} className="w-full mt-3" onEnquire={() => {}} />
        )}

        {!isOwn && (() => {
          const tier = p.listingTier ?? (p.proUserId ? "full" : "external_link");
          const websiteHref = p.website ? normalizeWebsiteUrl(p.website) : "";

          // ONE front door to booking: every listing offers the same
          // in-app "Enquire now" action. The professional's external
          // booking link is never a CTA here — it surfaces inside the
          // enquiry thread once they accept.
          const enquireAction =
            tier === "full" && (p.proUserId || p.proProfileId) && canEnquire ? (
              <ProContactAction
                state={contact}
                canNavigateToEnquiries={memberActions}
                onEnquire={() =>
                  setEnquiryTarget({
                    proUserId: p.proUserId ?? null,
                    proProfileId: p.proProfileId ?? null,
                    name: p.name,
                  })
                }
              />
            ) : canEnquire ? (
              <button
                type="button"
                onClick={() =>
                  setExternalEnquiryTarget({
                    name: p.name,
                    directoryId: p.directoryId ?? null,
                    proUserId: p.proUserId ?? null,
                  })
                }
                className="py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium min-h-[44px] flex items-center justify-center text-center"
              >
                Enquire now
              </button>
            ) : null;

          return (
            <div
              className={cn(
                "grid gap-2 mt-3",
                enquireAction ? "grid-cols-2" : "grid-cols-1",
              )}
            >
              {websiteHref ? (
                <a
                  href={
                    tier === "external_link"
                      ? buildTrackedUrl(websiteHref, p.proUserId ?? p.directoryId ?? p.id)
                      : websiteHref
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (tier === "external_link") {
                      void logReferralClick({
                        targetUrl: websiteHref,
                        proUserId: p.proUserId ?? null,
                        directoryId: p.directoryId ?? null,
                      });
                    }
                  }}
                  className="py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary text-foreground rounded-md min-h-[44px] flex items-center justify-center text-center"
                >
                  Website
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => toast("Website unavailable")}
                  className="py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary/60 text-muted-foreground rounded-md min-h-[44px]"
                >
                  Website
                </button>
              )}

              {enquireAction}
            </div>
          );
        })()}


        {p.instaUrl && (
          <a
            href={p.instaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block text-center py-2 text-[11px] uppercase tracking-[0.1em] bg-card border border-border text-foreground rounded-md min-h-[36px]"
          >
            Instagram {p.insta}
          </a>
        )}
      </div>
      {p.discount && p.discount.trim().length > 0 && (
        <div className="bg-primary/15 px-4 py-2.5 text-xs">
          <span className="font-semibold tracking-[0.1em] uppercase text-primary">
            {p.discount}
          </span>
        </div>
      )}
    </SurfaceCard>
    );
  };

  return (
    <ScreenLayout bottomNav={memberActions}>
      <TitleBar title={bloodOnly ? "Book a Doctor" : "Professionals"} />

      {bloodOnly && (
        <div className="px-5 pb-3">
          <SurfaceCard tone="gold">
            <p className="text-xs font-body leading-snug">
              <span className="font-semibold uppercase tracking-[0.15em] text-primary">
                Blood test —{" "}
              </span>
              These verified dermatologists can run the bloods we need to assess hair-loss
              deficiencies. Tap any card to book.
            </p>
          </SurfaceCard>
        </div>
      )}

      {fromConsultation && (
        <div className="px-5 pb-3 space-y-2">
          <SurfaceCard tone="gold">
            <p className="text-xs font-body leading-snug">
              <span className="font-semibold uppercase tracking-[0.15em] text-primary">
                Consultation —{" "}
              </span>
              Book with a vetted professional below. Once you've had your consultation you can
              carry on where you left off — nothing you've entered is lost.
            </p>
          </SurfaceCard>
          <Button
            variant="goldGhost"
            size="pill"
            onClick={() => navigate("/onboarding/pro-details")}
          >
            Continue onboarding →
          </Button>
        </div>
      )}

      {anchorSelf && ownedListing && (
        <div className="px-5 pb-3">
          <div className="rounded-[12px] border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-[11px] font-body text-foreground/85 leading-snug">
            This is how consumers see your listing. Tap <span className="font-semibold">Edit</span> to update.
          </div>
        </div>
      )}

      <div className="px-5 pb-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, clinic, condition or location..."
            autoComplete="off"
            className="w-full pl-10 pr-3.5 py-3 bg-card rounded-[10px] border border-border text-sm focus:outline-none focus:border-primary/60"
          />
        </div>
      </div>

      {!bloodOnly && (
        <div className="pb-4 strand-hscroll px-5">
          <div className="flex gap-2 min-w-max">
            {visibleTabs.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setHighlightId(null);
                  if (proParam || anchorSelf) {
                    const next = new URLSearchParams(params);
                    next.delete("pro");
                    next.delete("self");
                    setParams(next, { replace: true });
                  }
                }}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-xs font-body border transition-colors min-h-[36px]",
                  tab === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-foreground",
                )}
              >
                {t}
                {t !== "All" && (
                  <span className="ml-1.5 opacity-60">{tabCounts[t]}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {(capCounts.doctor > 0 || capCounts.bloods > 0) && (
        <div className="pb-4 strand-hscroll px-5">
          <div className="flex gap-2 min-w-max">
            {CAP_FILTERS.filter((f) => capCounts[f.key] > 0).map((f) => {
              const active = caps[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCaps((c) => ({ ...c, [f.key]: !c[f.key] }))}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-body border transition-colors min-h-[36px]",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-foreground",
                  )}
                >
                  {f.key === "doctor" ? (
                    <Stethoscope className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Droplet className="size-3.5" aria-hidden="true" />
                  )}
                  {f.label}
                  <span className="opacity-60">{capCounts[f.key]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-5 space-y-4 pb-8">
        {loading && pros.length === 0 ? (
          <LoadingDot label="Loading directory…" fullScreen={false} />
        ) : results.length === 0 ? (
          <EmptyState
            icon="🔍"
            message="No professionals found"
            hint="Try a postcode, name, or specialism."
          />
        ) : (
          rows.map((row) =>
            row.kind === "solo" ? (
              renderProCard(row.pro)
            ) : (
              <SalonGroupCard
                key={`salon-${row.salonId}`}
                salonId={row.salonId}
                salonName={row.salonName}
                city={row.city}
                roster={row.roster}
                matched={row.matched}
                filterActive={filterActive}
                ratingFor={(pro) => (pro.proUserId ? reviewSummaries?.get(pro.proUserId) ?? null : null)}
                open={expandedSalons[row.salonId] === true}
                onToggle={() =>
                  setExpandedSalons((cur) => ({ ...cur, [row.salonId]: !cur[row.salonId] }))
                }
                renderStylist={renderProCard}
              />
            ),
          })
        )}

        {/* Role-aware footer CTA — keyed off the ACTIVE view (the same source of
            truth the switcher uses), never the account's raw roles, so a
            multi-role account sees the right prompt for the view it's in. */}
        <SurfaceCard tone="gold">
          <div className="space-y-2">
            {allowsProFeatures(roleView) ? (
              <>
                <div className="flex items-start gap-2">
                  <Tag className="size-4 text-primary shrink-0 mt-0.5" />
                  <p className="font-display text-base leading-tight">Add a listing discount?</p>
                </div>
                <p className="text-xs font-body text-muted-foreground leading-snug">
                  Members browsing this directory are already deciding who to book. A
                  time-limited discount clients use on their first appointment puts you in front
                  of them at that exact moment — and gives them a reason to choose you.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/pro/offers")}
                  className="mt-1 inline-flex items-center justify-center w-full py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium min-h-[44px]"
                >
                  Create a listing discount
                </button>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <UserPlus className="size-4 text-primary shrink-0 mt-0.5" />
                  <p className="font-display text-base leading-tight">Are you a professional?</p>
                </div>
                <p className="text-xs font-body text-muted-foreground leading-snug">
                  Join the STRAND directory and get discovered by members actively looking for
                  help with their hair.
                </p>
                <a
                  href="/pro/apply"
                  className="mt-1 inline-flex items-center justify-center w-full py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium min-h-[44px]"
                >
                  Join the directory
                </a>
              </>
            )}
          </div>
        </SurfaceCard>

      </div>


      {showTop && (
        <button
          type="button"
          onClick={scrollToTop}
          aria-label="Back to top"
          className="fixed bottom-6 right-6 z-30 size-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        >
          <ArrowUp className="size-5" />
        </button>
      )}
      {enquiryTarget && (
        <EnquiryDialog
          open={!!enquiryTarget}
          onOpenChange={(o) => !o && setEnquiryTarget(null)}
          proUserId={enquiryTarget.proUserId}
          proProfileId={enquiryTarget.proProfileId}
          proName={enquiryTarget.name}
        />
      )}
      {externalEnquiryTarget && (
        <ExternalEnquiryDialog
          open={!!externalEnquiryTarget}
          onOpenChange={(o) => !o && setExternalEnquiryTarget(null)}
          proName={externalEnquiryTarget.name}
          directoryId={externalEnquiryTarget.directoryId}
          proUserId={externalEnquiryTarget.proUserId}
        />
      )}

    </ScreenLayout>
  );
};

export default Directory;
