// ── ONE PRODUCT, ONE ROW ──────────────────────────────────────────────────
//
// `user_products` is unique on (user_id, product_key). The photo-scan flow
// used to mint `scan-${Date.now()}`, so scanning the same bottle twice always
// produced a second row with its own analysis and its own score. Names and
// brands also arrive slightly differently from each scan ("FutureIQ™" vs
// "Future IQ™", "K18" vs "K18 Biomimetic Hairscience"), so any dedupe that
// compares the raw strings misses.
//
// This module is the single identity rule:
//   canonicalProductKey(name, brand) → stable, normalised key
//   resolveProductKey(...)           → that key, unless one of the member's
//                                      existing rows already resolves to the
//                                      same identity, in which case its key is
//                                      reused so the upsert updates that row.
//
// Nothing here deletes or merges anything — it only stops NEW duplicates.

import { supabase } from "@/integrations/supabase/client";
import { normaliseProductText, stripParentheticals } from "@/lib/productMatch";

/** Lowercase, de-accented, de-trademarked, punctuation-free identity string. */
export function productIdentity(name: string, brand?: string | null): string {
  const norm = (v: string) =>
    normaliseProductText(stripParentheticals(v))
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const n = norm(name ?? "");
  const b = norm(brand ?? "");
  // Brand words often repeat inside the product name and vary in length
  // ("K18" vs "K18 Biomimetic Hairscience"). Only the FIRST brand token is
  // part of the identity, and it is dropped when the name already carries it.
  const brandToken = b.split(" ")[0] ?? "";
  const nameOnly = n.startsWith(`${brandToken} `) ? n.slice(brandToken.length + 1) : n;
  // Digits and letters are joined so "future iq" and "futureiq" agree.
  const compact = nameOnly.replace(/ /g, "");
  return brandToken ? `${brandToken}:${compact}` : compact;
}

/** Deterministic product_key for a newly captured product. */
export function canonicalProductKey(name: string, brand?: string | null): string {
  const id = productIdentity(name, brand);
  return `p:${id}`.slice(0, 120);
}

/**
 * The key a save should use: an existing row's key when the member already has
 * this product (however differently it was spelled last time), otherwise the
 * canonical key. Never throws — falls back to the canonical key.
 */
export async function resolveProductKey(
  userId: string,
  name: string,
  brand?: string | null,
): Promise<{ product_key: string; reused_row_id: string | null }> {
  const canonical = canonicalProductKey(name, brand);
  const target = productIdentity(name, brand);
  try {
    const { data } = await supabase
      .from("user_products")
      .select("id, product_key, name, brand")
      .eq("user_id", userId);
    const hit = (data ?? []).find(
      (r) => productIdentity(r.name ?? "", r.brand) === target,
    );
    if (hit) return { product_key: hit.product_key, reused_row_id: hit.id };
  } catch {
    /* fall through to the canonical key */
  }
  return { product_key: canonical, reused_row_id: null };
}
