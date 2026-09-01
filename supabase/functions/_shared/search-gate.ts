// ── CONDITIONAL WEB SEARCH (2026-09-01) ───────────────────────────────────
//
// WHY. Both scan surfaces attached Anthropic's native `web_search` server tool
// on EVERY call. Each search round costs ~8-12s of wall clock, and on a clear
// pack or a rich product page it buys nothing — the pack IS the source of
// truth. The prompt asked the model to search "only if needed"; the model
// searched anyway on a large share of scans.
//
// The rule now: search is only made AVAILABLE when the held sources genuinely
// cannot cover the product.
//   • URL flow — the page is prefetched, so coverage is KNOWN before the call:
//     a page giving brand + name + a real INCI list gets no search tool.
//   • Photo flow — coverage is only knowable after the read, so the first
//     attempt runs searchless and a second attempt is granted search ONLY when
//     the returned payload shows the label could not be read.
//
// Verification strength is unchanged: the retry is exactly the old behaviour,
// so an unreadable pack still gets the same search budget it always had.

export interface SearchDecision {
  /** Attach the web_search server tool at all. */
  enabled: boolean;
  maxUses: number;
  reason: string;
}

/** Coverage test for a prefetched product page / cached facts. */
export function sourcesCoverProduct(args: {
  brand?: string | null;
  productName?: string | null;
  ingredients?: string[] | null;
  /** Shared product-level facts already held for this exact formula. */
  haveSharedFacts?: boolean;
}): boolean {
  const brand = (args.brand ?? "").trim();
  const name = (args.productName ?? "").trim();
  const inci = (args.ingredients ?? []).map((i) => String(i ?? "").trim()).filter(Boolean);
  if (args.haveSharedFacts && name) return true;
  return brand.length >= 2 && name.length >= 3 && inci.length >= 5;
}

/**
 * Does the prefetched page body itself carry a real INCI panel? An ingredient
 * heading followed by a long comma-separated list is the signature; that is the
 * source of truth for the formula, and searching past it buys nothing.
 */
export function pageLikelyHasInci(pageText?: string | null): boolean {
  const text = (pageText ?? "").toLowerCase();
  if (text.length < 400) return false;
  const idx = text.search(/ingredients?\s*[:\-–]|full ingredients|inci/);
  if (idx < 0) return false;
  const window = text.slice(idx, idx + 1500);
  const commas = (window.match(/,/g) ?? []).length;
  return commas >= 5;
}

/** URL flow: decided before the writer call, from the prefetched page. */
export function decideUrlSearch(args: {
  havePage: boolean;
  pageText?: string | null;
  brand?: string | null;
  productName?: string | null;
  ingredients?: string[] | null;
  haveSharedFacts?: boolean;
}): SearchDecision {
  const covered = sourcesCoverProduct(args) || pageLikelyHasInci(args.pageText);
  if (args.havePage && covered) {
    return { enabled: false, maxUses: 0, reason: "page_covers_product" };
  }
  return {
    enabled: true,
    maxUses: args.havePage ? 2 : 3,
    reason: args.havePage ? "page_thin" : "no_page",
  };
}

/** Photo flow: first attempt never gets search. */
export function decidePhotoSearch(attempt: number, grantedRetry: boolean): SearchDecision {
  if (attempt === 1 && !grantedRetry) {
    return { enabled: false, maxUses: 0, reason: "pack_is_the_source" };
  }
  return { enabled: true, maxUses: 2, reason: "label_unreadable" };
}

const UNREADABLE_MARKERS = [
  "couldn't fully read",
  "could not fully read",
  "couldn't read",
  "unable to read",
  "not legible",
  "illegible",
];

/**
 * Did the searchless read actually fail? Only these cases earn a search round:
 * no brand, no product name, an INCI list too short to be a real panel, or the
 * model's own "couldn't fully read the label" admission.
 */
export function needsSearchRetry(payload: unknown): { needed: boolean; reason: string } {
  const p = (payload ?? {}) as Record<string, unknown>;
  const brand = String(p.brand ?? "").trim();
  const name = String(p.product_name ?? "").trim();
  const inci = Array.isArray(p.ingredients)
    ? (p.ingredients as unknown[]).map((i) => String(i ?? "").trim()).filter(Boolean)
    : [];
  const summary = String(p.ai_summary ?? "").toLowerCase();
  if (!name || name.length < 3) return { needed: true, reason: "no_product_name" };
  if (!brand || brand.length < 2) return { needed: true, reason: "no_brand" };
  if (inci.length < 3) return { needed: true, reason: "no_ingredient_panel" };
  if (UNREADABLE_MARKERS.some((m) => summary.includes(m))) {
    return { needed: true, reason: "model_reported_unreadable" };
  }
  return { needed: false, reason: "pack_read_cleanly" };
}
