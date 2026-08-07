// Consumer side of the brand shelf — add a brand's catalogue product to your
// own shelf or wishlist.
//
// This reuses the ordinary user_products row shape, so every existing surface
// (shelf cards, wash day pickers, passport, PDFs, AI context) treats it as a
// normal product. The only differences are:
//   • `linked_brand_product_id` records which catalogue entry it came from.
//   • `ingredients_source = 'brand'` — the ingredient list is the brand's own,
//     not an OCR guess from a label photo.
// The match score is NOT invented here. The member is routed to the standard
// product page, which runs `ingredient-analysis` and writes the single
// source-of-truth score into `user_products.match_score`.

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

/**
 * Creates (or refreshes) the member's row for a brand catalogue product.
 * Returns the product_key to navigate to, or null on failure.
 */
export async function addBrandProductToShelf(opts: {
  userId: string;
  brandName: string | null;
  product: BrandShelfProduct;
  destination: ShelfDestination;
}): Promise<string | null> {
  const { userId, brandName, product, destination } = opts;
  const product_key = brandProductKey(product.id);
  const now = new Date().toISOString();

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
    ingredients_source: "brand",
    on_shelf: destination === "shelf",
    on_wishlist: destination === "wishlist",
    ...(destination === "shelf" ? { added_to_shelf_at: now } : {}),
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
  return product_key;
}
