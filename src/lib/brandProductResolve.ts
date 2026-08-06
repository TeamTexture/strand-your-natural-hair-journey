// Deterministic resolver that links a member's own product row to a brand's
// approved catalogue product.
//
// There is exactly ONE matcher in the app. This module reuses the same
// normalisers as the inline product-linking pass (`src/lib/productMatch.ts`)
// so a name that links in AI copy resolves identically here.
//
// CONFIDENCE RULE — exact only, never fuzzy:
//   1. Both sides are normalised (lowercased, trademarks/punctuation stripped,
//      parentheticals removed, whitespace collapsed).
//   2. A match requires an EXACT string equality between one of the member's
//      normalised forms and one of the brand product's normalised forms.
//      Forms are: "name", "brand name", and "name with a leading duplicate
//      brand stripped".
//   3. `kind` must be equal (a product never resolves to a tool).
//   4. The normalised form must be at least 6 characters — short names like
//      "gel" or "oil" are far too generic to link.
//   5. If two or more DISTINCT brand products match, the result is null.
//      Ambiguity is never resolved by guessing.
// Anything that doesn't clear all five rules stays unlinked.

import { supabase } from "@/integrations/supabase/client";
import { normaliseProductText, stripParentheticals } from "@/lib/productMatch";

export interface BrandIndexEntry {
  id: string;
  name: string;
  brand_name: string | null;
  kind: string | null;
  brand_user_id: string | null;
}

export interface BrandProductLink {
  brand_product_id: string;
  brand_user_id: string | null;
  brand_name: string | null;
}

const MIN_FORM_LENGTH = 6;

/** All normalised forms a name/brand pair can legitimately be written as. */
export const brandMatchForms = (
  name: string | null | undefined,
  brand: string | null | undefined,
): string[] => {
  const forms = new Set<string>();
  const n = normaliseProductText(stripParentheticals(name ?? ""));
  const b = normaliseProductText(stripParentheticals(brand ?? ""));
  if (n) {
    forms.add(n);
    if (b) forms.add(`${b} ${n}`);
    // "Curlsmith Curlsmith Hydro Cream" style duplication, and the reverse:
    // a member typing the brand into the product name field.
    if (b && n.startsWith(`${b} `)) {
      const tail = n.slice(b.length + 1).trim();
      if (tail) forms.add(tail);
    }
  }
  return [...forms].filter((f) => f.length >= MIN_FORM_LENGTH);
};

const sameKind = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "product") === (b ?? "product");

/**
 * Pure resolution step — exported so it can be unit tested and reused for the
 * historical backfill without touching the network.
 */
export function resolveAgainstIndex(
  candidate: { name: string | null | undefined; brand: string | null | undefined; kind?: string | null },
  index: BrandIndexEntry[],
): BrandProductLink | null {
  const forms = new Set(brandMatchForms(candidate.name, candidate.brand));
  if (forms.size === 0) return null;

  const hits: BrandIndexEntry[] = [];
  for (const entry of index) {
    if (!sameKind(entry.kind, candidate.kind)) continue;
    const entryForms = brandMatchForms(entry.name, entry.brand_name);
    if (entryForms.some((f) => forms.has(f))) hits.push(entry);
  }

  const distinct = [...new Set(hits.map((h) => h.id))];
  if (distinct.length !== 1) return null; // no match, or ambiguous
  const hit = hits.find((h) => h.id === distinct[0])!;
  return { brand_product_id: hit.id, brand_user_id: hit.brand_user_id, brand_name: hit.brand_name };
}

// The index is small (approved + published catalogue only) and changes rarely.
// Cache it for the session so scan/link saves don't pay a round trip each time.
let cache: { at: number; rows: BrandIndexEntry[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function loadBrandProductIndex(force = false): Promise<BrandIndexEntry[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const { data, error } = await supabase.rpc("brand_product_match_index");
  if (error) {
    console.warn("brand_product_match_index failed", error);
    return cache?.rows ?? [];
  }
  const rows = (data ?? []) as BrandIndexEntry[];
  cache = { at: Date.now(), rows };
  return rows;
}

/**
 * Resolve at add-time. Returns null whenever the match isn't certain — the
 * member's row simply stays unlinked, which is always the safe outcome.
 */
export async function resolveBrandProductLink(candidate: {
  name: string | null | undefined;
  brand: string | null | undefined;
  kind?: string | null;
}): Promise<BrandProductLink | null> {
  try {
    const index = await loadBrandProductIndex();
    if (index.length === 0) return null;
    return resolveAgainstIndex(candidate, index);
  } catch (e) {
    console.warn("brand product resolution skipped", e);
    return null;
  }
}
