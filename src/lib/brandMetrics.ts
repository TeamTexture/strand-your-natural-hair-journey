// Brand-facing metric and status vocabulary — one definition per figure.
//
// WHY THIS FILE EXISTS
// The brand dashboard previously reported the same campaign three different
// ways: the campaign card summed a daily rollup view, the campaign detail read
// a second view (which silently failed and rendered zeros), and the
// before/after block read the raw event log. Three sources, three impression
// figures, and an "engagement rate" that divided raw interaction counts by
// deduplicated viewers — which produced 1036%.
//
// Every campaign figure now comes from ONE query (`brand_offer_metrics`, see
// useBrandOfferMetrics) and is labelled through the helpers below.

import { bandMemberCount } from "@/lib/adTargeting";

/** One campaign's figures for one phase. Mirrors public.brand_offer_metrics. */
export interface OfferMetrics {
  /** Distinct members with any event on the advert. An interaction implies
   *  exposure, so this is always >= interactors. */
  reach: number;
  /** Distinct members who expanded, copied the code, clicked through, or saved
   *  it — counted once each however many times they acted. */
  interactors: number;
  code_copies: number;
  link_clicks: number;
  expands: number;
  wishlist_adds: number;
  /** Total view events, including repeat views by the same member. */
  raw_views: number;
}

export interface OfferMetricsBundle {
  all: OfferMetrics;
  /** Present only when the campaign's audience was changed mid-run. */
  before?: OfferMetrics;
  after?: OfferMetrics;
  changedAt?: string;
}

export const EMPTY_METRICS: OfferMetrics = {
  reach: 0,
  interactors: 0,
  code_copies: 0,
  link_clicks: 0,
  expands: 0,
  wishlist_adds: 0,
  raw_views: 0,
};

/**
 * Engagement rate = distinct members who interacted / distinct members who saw
 * it. Both sides count each member once, and reach is defined as any event
 * (view OR interaction), so interactors can never exceed reach — the result is
 * bounded at 100% by construction. The `Math.min` is belt-and-braces only.
 */
export function engagementRate(m: OfferMetrics): number | null {
  if (m.reach <= 0) return null;
  const rate = (Math.min(m.interactors, m.reach) / m.reach) * 100;
  return Math.round(rate * 10) / 10;
}

export const formatEngagementRate = (m: OfferMetrics): string => {
  const rate = engagementRate(m);
  return rate == null ? "—" : `${rate}%`;
};

/**
 * Any engagement figure, for display. Zero reads as an em dash and nothing
 * else — "no members match yet" is targeting language and reads as an
 * indictment on an engagement figure. Brands see approximate ranges; admins see
 * the exact number.
 */
export function engagementFigure(value: number | null | undefined, exact: boolean): string {
  if (value == null || value === 0) return "—";
  return exact ? String(value) : bandMemberCount(value);
}

/** Shortened note kept alongside campaign figures. */
export const IMPRESSION_NOTE =
  "Reach counts each member once — half the advert on screen for a full second.";

export const RANGE_NOTE = "Figures are approximate ranges. You never see individual members.";

// ---------------------------------------------------------------------------
// Product approval status — one label set for every surface.
// ---------------------------------------------------------------------------

export type ShelfStatusTone = "review" | "live" | "hidden" | "rejected";

export interface ShelfStatus {
  label: string;
  tone: ShelfStatusTone;
  /** Tailwind classes for a pill, so surfaces don't invent their own tones. */
  pillClass: string;
}

const TONE_CLASS: Record<ShelfStatusTone, string> = {
  review: "bg-warn/15 text-warn",
  live: "bg-primary/15 text-primary",
  hidden: "bg-muted text-muted-foreground",
  rejected: "bg-destructive/10 text-destructive",
};

/**
 * The single source of truth for what a brand product's state is called.
 * Derived from approval_status plus the brand's own hide flag — never from the
 * hide flag alone, which is how a pending product came to read "On your page".
 */
export function shelfItemStatus(item: {
  approval_status: string | null;
  is_published: boolean | null;
}): ShelfStatus {
  const make = (label: string, tone: ShelfStatusTone): ShelfStatus => ({
    label,
    tone,
    pillClass: TONE_CLASS[tone],
  });
  if (item.approval_status === "rejected") return make("Not approved", "rejected");
  if (item.approval_status === "approved") {
    return item.is_published ? make("On your page", "live") : make("Hidden", "hidden");
  }
  // pending, or anything unrecognised: it is not yet cleared to show.
  return make("In review", "review");
}
