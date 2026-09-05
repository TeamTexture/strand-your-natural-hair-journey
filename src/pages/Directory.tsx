import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BadgeCheck, ArrowUp, Search, Star, Pencil, Clock, ChevronDown, MapPin, Phone, Mail, Tag, UserPlus, Stethoscope, Droplet, Scissors,
} from "lucide-react";

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
import SalonGroupCard, { type DirectoryRow } from "@/components/directory/SalonGroupCard";
import StarRating from "@/components/StarRating";
import { useReviewSummaries } from "@/hooks/useReviews";
import DirectoryReviewPreview from "@/components/DirectoryReviewPreview";
import { normalizeWebsiteUrl } from "@/lib/socialLinks";
import { summariseOpeningHours, listOpeningHours } from "@/lib/openingHours";
import { useAuth } from "@/hooks/useAuth";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";

import { formatDistanceToNow, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import { allowsMemberFeatures, allowsProFeatures } from "@/lib/viewFeatures";
import CapabilityBadges from "@/components/pro/CapabilityBadges";

type DirectoryTab = "All" | ProType;

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

  const { user, signOut } = useAuth();
  // Effective target for anchoring: explicit ?pro= wins, otherwise ?self=1
  // resolves to the current user's own listing.
  const targetProUserId = proParam ?? (anchorSelf && user?.id ? user.id : null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [tab, setTab] = useState<DirectoryTab>(bloodOnly ? "Dermatologist" : "All");
  const [query, setQuery] = useState("");
  const { pros, loading, error: directoryError, refresh } = useDirectoryProfessionals();
  const { stateForListing } = useProContactStates();
  // Hard wall: in the Professional / Brand / Admin views the directory is
  // read-only. No member enquiry state, no member chat, no member bottom nav.
  const roleView = useActiveRoleView();
  const memberActions = allowsMemberFeatures(roleView);
  // Booking a professional is not a member-only feature: professionals are also
  // end users and must be able to enquire with their peers.
  const canEnquire = memberActions || allowsProFeatures(roleView);
  // PRE-ACCESS BROWSING (signed out, or signed up but not yet through
  // onboarding/payment). In-app enquiries aren't available to them, so the card
  // offers ONE action: book a consultation on the professional's own booking
  // link. While membership is still resolving we assume access, so an existing
  // member never sees the pre-access CTA flash.
  const { hasAccess, isLoading: membershipLoading } = useConsumerSubscription();
  const preAccess = !user || (!membershipLoading && !hasAccess);


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
  const [expandedServices, setExpandedServices] = useState<Record<string, boolean>>({});
  const [expandedSalons, setExpandedSalons] = useState<Record<string, boolean>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Verified-capability filters. Never sticky in the URL, cleared on tab change.
  const [caps, setCaps] = useState<{ doctor: boolean; bloods: boolean }>({
    doctor: false,
    bloods: false,
  });

  /**
   * FEATURED SLOT — at most ONE promoted listing, chosen purely by the dated
   * window on `pro_profiles` (see isFeaturedToday in useDirectoryProfessionals).
   * Order: featured_rank ascending, then display name. When nobody qualifies
   * today this is null and NOTHING renders — no heading, no placeholder.
   */
  const featuredPro: Professional | null = useMemo(() => {
    const eligible = pros.filter((p) => p.isFeaturedSlot === true);
    if (eligible.length === 0) return null;
    return [...eligible].sort((a, b) => {
      const ra = a.featuredSlotRank ?? Number.MAX_SAFE_INTEGER;
      const rb = b.featuredSlotRank ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.name.localeCompare(b.name);
    })[0];
  }, [pros]);

  // The featured pro is removed from the listing below so she can never appear
  // twice on the same screen — including inside her salon's group card.
  const listPros = useMemo(
    () => (featuredPro ? pros.filter((p) => p.id !== featuredPro.id) : pros),
    [pros, featuredPro],
  );

  const results = useMemo(() => {
    const base = searchProfessionalsIn(listPros, query, bloodOnly ? "Dermatologist" : tab);
    return base.filter(
      (p) =>
        (!caps.doctor || p.isDoctorVerified === true) &&
        (!caps.bloods || p.canTakeBloodsVerified === true),
    );
  }, [listPros, query, tab, bloodOnly, caps]);

  // Chip counts come from the FULL live directory (`pros` = published,
  // unsuspended pro profiles + active curated rows), never from the filtered
  // result set — so chips don't flicker as search/other filters change.
  // The featured pro is counted too: she's excluded from the list below the
  // featured card but she is still a live pro.
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
      doctor: listPros.filter((p) => p.isDoctorVerified === true).length,
      bloods: listPros.filter((p) => p.canTakeBloodsVerified === true).length,
    }),
    [listPros],
  );


  // Never leave the user stranded on a filter that has emptied out.
  useEffect(() => {
    setCaps((c) => ({
      doctor: c.doctor && capCounts.doctor > 0,
      bloods: c.bloods && capCounts.bloods > 0,
    }));
  }, [capCounts.doctor, capCounts.bloods]);

  // "All" first, then every discipline with at least one live pro, ordered by
  // count descending then alphabetically.
  const visibleTabs = useMemo<Array<"All" | ProType>>(() => {
    const withPros = (Object.keys(tabCounts) as ProType[])
      .filter((t) => (tabCounts[t] ?? 0) > 0)
      .sort((a, b) => (tabCounts[b] ?? 0) - (tabCounts[a] ?? 0) || a.localeCompare(b));
    return ["All", ...withPros];
  }, [tabCounts]);


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
    // A stylist inside a collapsed salon group isn't in the DOM yet — open her
    // salon before we try to scroll to her card.
    if (targetListing.salonId) {
      setExpandedSalons((cur) => ({ ...cur, [targetListing.salonId!]: true }));
    }
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
    for (const p of listPros) {
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
  }, [listPros, results]);

  /**
   * ONE card renderer for every listing — solo pro, curated row, or a stylist
   * inside an expanded salon group. There is deliberately no second card
   * component: a salon stylist must read exactly like any other professional.
   */
  const renderProCard = (p: Professional, opts?: { featuredSlot?: boolean }) => {
    const inFeaturedSlot = opts?.featuredSlot === true;
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
    const services = (p.services ?? []).filter((s) => s.name.trim().length > 0);
    const servicesOpen = expandedServices[p.id] === true;
    // Every live discount on the listing, newest first. Falls back to the
    // single legacy line so curated/seed rows still render.
    const offers =
      p.offers && p.offers.length > 0
        ? p.offers
        : p.discount && p.discount.trim().length > 0
          ? [{ title: p.discount, code: null as string | null }]
          : [];
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
        // PROMOTED featured slot: same background and radius as every other
        // card, lifted only by a 2px gold border. Nothing else diverges.
        inFeaturedSlot && "border-2 border-primary",
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
              <div className="flex items-start gap-1.5 min-w-0">
                {isOwn && (
                  <Star
                    className="size-3.5 text-primary shrink-0 mt-1"
                    fill="currentColor"
                    aria-label="Your listing"
                  />
                )}
                {/* Names are never clipped: a professional's full name is the
                    one thing a member must be able to read, so it wraps to two
                    lines instead of truncating. */}
                <p className="font-display text-base font-semibold leading-tight break-words min-w-0">
                  {p.name}
                </p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {inFeaturedSlot && (
                  <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-[0.12em] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/40">
                    Featured
                  </span>
                )}
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

        {/* Qualifications the professional entered — part of their listing. */}
        {p.qualifications && p.qualifications.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-body font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Qualifications
            </p>
            <ul className="mt-1 space-y-0.5">
              {p.qualifications.map((q) => (
                <li key={q} className="flex items-start gap-1.5 text-[11px] font-body text-foreground/85">
                  <BadgeCheck className="size-3.5 text-primary shrink-0 mt-[1px]" />
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Services and prices, exactly as the professional entered them. */}
        {services.length > 0 && (
          <div className="mt-3 rounded-[10px] border border-border/70 bg-background/60">
            <button
              type="button"
              onClick={() =>
                setExpandedServices((cur) => ({ ...cur, [p.id]: !cur[p.id] }))
              }
              className="w-full flex items-center gap-2 px-3 py-2 text-left"
              aria-expanded={servicesOpen}
            >
              <Scissors className="size-3.5 text-primary shrink-0" />
              <span className="text-[11px] font-body text-foreground/85 flex-1">
                Services &amp; prices ({services.length})
              </span>
              <ChevronDown
                className={cn(
                  "size-3.5 text-muted-foreground transition-transform",
                  servicesOpen && "rotate-180",
                )}
              />
            </button>
            {servicesOpen && (
              <ul className="px-3 pb-2 pt-1 space-y-2 border-t border-border/60">
                {services.map((s, i) => (
                  <li key={`${s.name}-${i}`} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-body font-semibold text-foreground break-words">
                        {s.name}
                      </p>
                      {s.description && s.description.trim().length > 0 && (
                        <p className="text-[11px] font-body text-muted-foreground leading-snug">
                          {s.description}
                        </p>
                      )}
                    </div>
                    {s.price && s.price.trim().length > 0 && (
                      <span className="shrink-0 text-[11px] font-body font-semibold text-primary">
                        {s.price}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* The professional's own work gallery. */}
        {p.galleryUrls && p.galleryUrls.length > 0 && (
          <div className="mt-3 -mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar">
            {p.galleryUrls.map((url) => (
              <img
                key={url}
                src={url}
                alt={`Work by ${p.name}`}
                loading="lazy"
                className="size-[76px] shrink-0 rounded-[10px] object-cover border border-border/60"
              />
            ))}
          </div>
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
          const bookingHref = p.bookingUrl
            ? normalizeWebsiteUrl(p.bookingUrl) || ""
            : "";

          // PRE-ACCESS: one action only — "Book consultation" — pointing at the
          // professional's own booking link (their website is the fallback).
          // In-app enquiries need a membership, so they're not offered here.
          if (preAccess) {
            const consultHref = bookingHref || websiteHref;
            const trackTarget = p.proUserId ?? p.directoryId ?? p.id;
            return (
              <div className="mt-3">
                {consultHref ? (
                  <a
                    href={buildTrackedUrl(consultHref, trackTarget)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      void logReferralClick({
                        targetUrl: consultHref,
                        proUserId: p.proUserId ?? null,
                        directoryId: p.directoryId ?? null,
                      });
                    }}
                    className="w-full py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium min-h-[44px] flex items-center justify-center text-center"
                  >
                    Book consultation
                  </a>
                ) : p.businessEmail ? (
                  <a
                    href={`mailto:${p.businessEmail}?subject=Consultation%20enquiry`}
                    className="w-full py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium min-h-[44px] flex items-center justify-center text-center"
                  >
                    Book consultation
                  </a>
                ) : p.businessPhone ? (
                  <a
                    href={`tel:${p.businessPhone.replace(/\s+/g, "")}`}
                    className="w-full py-2 text-[11px] uppercase tracking-[0.1em] bg-primary text-primary-foreground rounded-md font-medium min-h-[44px] flex items-center justify-center text-center"
                  >
                    Book consultation
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => toast("Booking details coming soon")}
                    className="w-full py-2 text-[11px] uppercase tracking-[0.1em] bg-secondary/60 text-muted-foreground rounded-md min-h-[44px]"
                  >
                    Book consultation
                  </button>
                )}
                {consultHref && (
                  <p className="mt-2 text-center text-[10px] text-muted-foreground">
                    Opens {p.name}'s own booking page
                  </p>
                )}
              </div>
            );
          }

          // MEMBERS: ONE front door to booking — the in-app enquiry. The
          // professional's external booking link surfaces inside the thread
          // once they accept.
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
      {offers.length > 0 && (
        <div className="bg-primary/15 px-4 py-2.5 space-y-2">
          {offers.map((o, i) => (
            <div key={`${o.title}-${i}`} className="text-xs">
              <span className="font-semibold tracking-[0.1em] uppercase text-primary break-words">
                {o.code ? `${o.code} — ${o.title}` : o.title}
              </span>
              {o.description && o.description.trim().length > 0 && (
                <p className="text-[11px] font-body text-foreground/80 leading-snug mt-0.5">
                  {o.description}
                </p>
              )}
              {o.endsAt && (
                <p className="text-[10px] font-body text-muted-foreground mt-0.5">
                  Valid until {format(new Date(o.endsAt), "d MMM yyyy")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </SurfaceCard>
    );
  };

  return (
    <ScreenLayout bottomNav={memberActions}>
      <TitleBar title={bloodOnly ? "Book a Doctor" : "Professionals"} />

      {/* Discount codes are a signed-in member benefit — say so plainly rather
          than implying a code exists on any particular listing. */}
      {!user && (
        <div className="px-5 pb-3">
          <p className="text-[11px] font-body text-muted-foreground leading-snug">
            <Tag className="size-3 text-primary inline mr-1 align-[-1px]" />
            STRAND member discounts are shown when you sign in.
          </p>
        </div>
      )}



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
          <p className="text-[11px] font-body text-muted-foreground text-center leading-snug">
            Everything you've entered is saved. Use <span className="font-semibold text-primary">Save &amp; sign out</span> at the top, then sign back in after your appointment and we'll
            pick up exactly where you left off.
          </p>
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

      {/* PROMOTED featured slot. Renders nothing at all when no professional
          is dated into the slot today — no heading, no empty state. */}
      {featuredPro && !loading && (
        <div className="px-5 pb-4">{renderProCard(featuredPro, { featuredSlot: true })}</div>
      )}

      <div className="px-5 space-y-4 pb-8">
        {loading && pros.length === 0 ? (
          <LoadingDot label="Loading directory…" fullScreen={false} />
        ) : directoryError && pros.length === 0 ? (
          <div className="rounded-[10px] border border-border bg-card p-4 text-center space-y-2">
            <p className="font-body text-[13px] text-foreground">
              We couldn't load the professionals list just now.
            </p>
            <p className="font-body text-[11px] text-muted-foreground">
              This is a connection problem, not a change to who is listed.
            </p>
            <button
              type="button"
              onClick={() => refresh()}
              className="mt-1 inline-flex items-center justify-center whitespace-nowrap px-4 py-2 rounded-pill bg-primary text-primary-foreground text-[11px] font-semibold uppercase tracking-[0.15em] min-h-[44px]"
            >
              Try again
            </button>
          </div>

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
          )
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
                  <p className="card-title font-display text-[15px] leading-tight">Add a listing discount?</p>
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
                  <p className="card-title font-display text-[15px] leading-tight">Are you a professional?</p>
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
