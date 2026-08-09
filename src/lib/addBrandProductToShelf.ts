// Consumer side of the brand shelf — add a brand's catalogue product to your
// own shelf or wishlist.
//
// Products reuse the ordinary user_products row shape, so every existing
// surface (shelf cards, wash day pickers, passport, PDFs, AI context) treats it
// as a normal product. The only differences are:
//   • `linked_brand_product_id` records which catalogue entry it came from.
//   • `ingredients_source = 'brand'` — the ingredient list is the brand's own,
//     not an OCR guess from a label photo.
// The match score is NOT invented here. The member is routed to the standard
// product page, which runs `ingredient-analysis` and writes the single
// source-of-truth score into `user_products.match_score`.
//
// TOOLS ARE NOT PRODUCTS. A catalogue item with `kind = 'tool'` (heat hat,
// dryer, diffuser…) has no ingredient label, so writing it into user_products
// put it on the shelf under a product category it doesn't belong to and created
// a duplicate of the member's real tool. Tools go to `user_tools` instead,
// keyed identically to the advert path (`brand-offer-tool:<catalogue id>`) so
// the two routes can never create two rows for the same item. The tool's match
// score comes from `useToolMatchScores` on My Tools.

import { supabase } from "@/integrations/supabase/client";

export interface BrandShelfProduct {
  id: string;
  name: string;
  description: string | null;
  kind: string | null;
  tool_kind: string | null;
  image_urls: string[] | null;
  ingredients: string[] | null;
  ingredients_source: string | null;
  key_features: string[] | null;
  materials: string[] | null;
  external_url: string | null;
  sort_position: number | null;
}

export type ShelfDestination = "shelf" | "wishlist";

export const brandProductKey = (brandProductId: string) => `brand-${brandProductId}`;
/** Same key the advert add-to-shelf path uses, so tools never duplicate. */
export const brandToolKey = (brandProductId: string) => `brand-offer-tool:${brandProductId}`;

export type AddedShelfItem =
  | { kind: "product"; productKey: string }
  | { kind: "tool"; toolId: string };

/**
 * Creates (or refreshes) the member's row for a brand catalogue item.
 * Returns what was written, or null on failure.
 */
export async function addBrandProductToShelf(opts: {
  userId: string;
  brandName: string | null;
  product: BrandShelfProduct;
  destination: ShelfDestination;
  /** Set when the add came from a live advert, so the offer gets the credit. */
  offerId?: string | null;
}): Promise<AddedShelfItem | null> {
  const { userId, brandName, product, destination, offerId = null } = opts;
  const toShelf = destination === "shelf";
  const now = new Date().toISOString();

  if (product.kind === "tool") {
    const toolId = await addBrandToolToTools({ userId, brandName, product, toShelf, offerId });
    if (!toolId) return null;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("user-tools-updated"));
    }
    return { kind: "tool", toolId };
  }


  const product_key = brandProductKey(product.id);
  const payload: Record<string, unknown> = {
    user_id: userId,
    product_key,
    name: product.name,
    brand: brandName,
    ingredients: product.ingredients ?? [],
    ai_summary: product.description ?? null,
    image_url: product.image_urls?.[0] ?? null,
    source_url: product.external_url ?? null,
    linked_brand_product_id: product.id,
    ...(offerId ? { linked_brand_offer_id: offerId } : {}),
    ingredients_source: "brand",
    on_shelf: toShelf,
    on_wishlist: !toShelf,
    ...(toShelf ? { added_to_shelf_at: now } : {}),
  };

  const { error } = await supabase
    .from("user_products")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(payload as any, { onConflict: "user_id,product_key" });
  if (error) {
    console.error("add brand product to shelf failed", error);
    return null;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("user-products-updated"));
  }
  return { kind: "product", productKey: product_key };
}

/** Writes a brand catalogue tool into the member's My Tools, de-duplicated. */
async function addBrandToolToTools(opts: {
  userId: string;
  brandName: string | null;
  product: BrandShelfProduct;
  toShelf: boolean;
  offerId?: string | null;
}): Promise<string | null> {
  const { userId, brandName, product, toShelf, offerId = null } = opts;
  const tool_key = brandToolKey(product.id);

  // A member can reach the same tool from the advert AND the brand page, and an
  // older hand-added row may exist too, so more than one row can match. Take a
  // list (never maybeSingle, which errors on multiple rows and used to make the
  // add fall through to an insert that then hit the unique tool_key index).
  const { data: matches } = await supabase
    .from("user_tools")
    .select("id, category, linked_brand_product_id")
    .eq("user_id", userId)
    .or(`tool_key.eq.${tool_key},linked_brand_product_id.eq.${product.id}`)
    .limit(5);

  const existing = (matches ?? [])[0] as
    | { id: string; category: string | null; linked_brand_product_id: string | null }
    | undefined;

  if (existing?.id) {
    const patch: Record<string, unknown> = toShelf
      ? { on_shelf: true, on_wishlist: false }
      : { on_wishlist: true };
    if (!existing.category && product.tool_kind) patch.category = product.tool_kind;
    if (!existing.linked_brand_product_id) patch.linked_brand_product_id = product.id;
    if (offerId) patch.linked_brand_offer_id = offerId;
    const { error } = await supabase
      .from("user_tools")
      .update(patch as never)
      .eq("id", existing.id);
    if (error) {
      console.error("refresh brand tool failed", error);
      return null;
    }
    return existing.id;
  }

  const insertRow = {
    user_id: userId,
    tool_key,
    name: product.name,
    brand: brandName,
    category: product.tool_kind ?? null,
    image_url: product.image_urls?.[0] ?? null,
    notes: product.description ?? null,
    source_url: product.external_url ?? null,
    on_shelf: toShelf,
    on_wishlist: !toShelf,
    linked_brand_product_id: product.id,
    ...(offerId ? { linked_brand_offer_id: offerId } : {}),
  };

  const { data, error } = await supabase
    .from("user_tools")
    .insert(insertRow as never)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("add brand tool failed", error);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}
