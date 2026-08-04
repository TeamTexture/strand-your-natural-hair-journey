/**
 * AT-HOME BLOOD TESTS ON THE BRAND DIRECTORY.
 *
 * There is no vendor registry. At-home blood test providers are brands with a
 * paid listing in the existing brand directory, carrying an admin-verified
 * capability flag plus one or more panels in `brand_blood_panels`.
 *
 * CLAIM IS NOT VERIFICATION — exactly as on the professional side. A brand may
 * tick `offers_at_home_blood_tests_claimed`; nothing surfaces to a member until
 * an admin sets `offers_at_home_blood_tests_verified`. At-home kits are
 * regulated as IVDs in the UK, so a claim from a brand that doesn't actually
 * sell one must never go live.
 */

import { BLOOD_RANGES } from "@/data/bloodRanges";

/** A single purchasable panel, joined to its brand for display. */
export interface BrandBloodPanel {
  id: string;
  brand_user_id: string;
  panel_name: string;
  markers_covered: string[];
  price_from: number | null;
  currency: string;
  purchase_url: string;
  affiliate_url: string | null;
  regions_served: string[];
  is_active: boolean;
  sort_order: number;
  /** Joined brand fields. */
  brand_name: string;
  logo_path: string | null;
}

/**
 * THE marker vocabulary. `blood_markers_covered` must use these strings
 * verbatim, because they are the same strings written to `blood_results.marker`
 * — that identity is what makes marker-aware ordering possible.
 */
export const BLOOD_MARKER_VOCABULARY: string[] = Object.keys(BLOOD_RANGES).sort((a, b) =>
  a.localeCompare(b),
);

/** Case/whitespace-tolerant comparison, but the stored value stays verbatim. */
const normaliseMarker = (m: string): string => m.trim().toLowerCase();

export const isKnownMarker = (m: string): boolean =>
  BLOOD_MARKER_VOCABULARY.some((v) => normaliseMarker(v) === normaliseMarker(m));

/** Markers a panel covers that the user actually needs retested. */
export function matchedMarkers(panel: BrandBloodPanel, needed: string[]): string[] {
  const want = new Set(needed.map(normaliseMarker));
  return panel.markers_covered.filter((m) => want.has(normaliseMarker(m)));
}

/**
 * Marker-aware ordering: a panel covering the overdue marker always outranks a
 * generic panel. Ties fall back to the directory's own sort (sort_order, then
 * brand name), so the existing ordering still governs everything else.
 */
export function orderPanelsByRelevance(
  panels: BrandBloodPanel[],
  needed: string[],
): BrandBloodPanel[] {
  return [...panels].sort((a, b) => {
    const am = matchedMarkers(a, needed).length;
    const bm = matchedMarkers(b, needed).length;
    if (am !== bm) return bm - am;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.brand_name.localeCompare(b.brand_name);
  });
}

/** Same rule for the professional route, where a discipline hints at bloods. */
export function priceLabel(price: number | null, currency: string): string | null {
  if (price == null) return null;
  const symbol = currency === "GBP" ? "£" : `${currency} `;
  return `From ${symbol}${Number(price).toFixed(2).replace(/\.00$/, "")}`;
}

export const isHttpsUrl = (raw: string): boolean => /^https:\/\/\S+$/i.test(raw.trim());

/** The claim fields a brand owns and may edit. Never a `_verified` column. */
export interface BrandBloodClaim {
  offers_at_home_blood_tests_claimed: boolean;
}

export const BRAND_BLOOD_CLAIM_HINT =
  "Tick this only if you sell an at-home blood testing kit. A STRAND admin checks the product before it appears to members.";
