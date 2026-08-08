import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { recomputeIngredientFlags } from "@/hooks/useIngredientLists";
import { toast } from "sonner";
import { withAuthLockRetry } from "@/lib/retryQuery";


export interface KeyIngredient {
  name: string;
  benefit?: string;
  flag?: "good" | "warn" | "avoid";
}

export interface UserProduct {
  id: string;
  product_key: string;
  name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  storage_path: string | null;
  ingredients: string[];
  key_ingredients: KeyIngredient[];
  ai_summary: string | null;
  match_score: number | null;
  rating: number | null;
  on_shelf: boolean;
  on_wishlist: boolean;
  on_favourite: boolean;
  previously_on_shelf: boolean;
  added_to_shelf_at: string | null;
  last_used_at: string | null;
  use_count: number;
  created_at: string;
  updated_at: string;
  linked_brand_offer_id: string | null;
  linked_brand_product_id: string | null;
}

export interface SponsoredNote {
  offerId: string;
  /** The canonical brand product this offer promotes — route by this, not the offer. */
  brandProductId: string;
  headline: string;
  discountCode: string | null;
  endsOn: string | null;
}

type Filter = "shelf" | "wishlist" | "off-shelf" | "favourite" | "all";

/** Loads the current user's products. Filter is applied client-side. */
export function useUserProducts(filter: Filter = "all", opts?: { static?: boolean }) {
  const isStatic = !!opts?.static;
  const { user } = useAuth();
  const [products, setProducts] = useState<UserProduct[]>([]);
  const [sponsoredById, setSponsoredById] = useState<Record<string, SponsoredNote>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setProducts([]);
      setSponsoredById({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await withAuthLockRetry(() =>
      supabase
        .from("user_products")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false }),
    );

    if (error) {
      console.error("user_products load failed", error);
      setProducts([]);
      setSponsoredById({});
    } else {
      let list = (data as unknown as UserProduct[]) ?? [];

      // Backfill missing storage_path with the newest user_product_photos row
      // for the same product_key. Scanned front photos land in
      // user_products.storage_path directly, but products added via older
      // flows only had images in user_product_photos, leaving shelf tiles
      // blank. Falling back here means every scanned or uploaded photo
      // shows up as the thumbnail consistently.
      const keysNeedingPhoto = list
        .filter((p) => !p.storage_path)
        .map((p) => p.product_key);
      if (keysNeedingPhoto.length) {
        const { data: photos } = await supabase
          .from("user_product_photos")
          .select("product_key, storage_path, created_at")
          .eq("user_id", user.id)
          .in("product_key", keysNeedingPhoto)
          .order("created_at", { ascending: false });
        const latestByKey = new Map<string, string>();
        for (const row of photos ?? []) {
          if (!latestByKey.has(row.product_key) && row.storage_path) {
            latestByKey.set(row.product_key, row.storage_path);
          }
        }
        if (latestByKey.size) {
          list = list.map((p) =>
            p.storage_path ? p : { ...p, storage_path: latestByKey.get(p.product_key) ?? null },
          );
        }
      }

      setProducts(list);
      // Sponsored context is resolved from the BRAND PRODUCT, never from a
      // stored offer id: offers end and are relaunched, the product persists.
      const brandProductIds = Array.from(
        new Set(list.map((p) => p.linked_brand_product_id).filter((x): x is string => !!x)),
      );
      if (brandProductIds.length) {
        const { data: links } = await supabase
          .from("brand_offer_products")
          .select("brand_product_id, offer_id, brand_offers!inner(id, headline, discount_code, ends_on, starts_on, status)")
          .in("brand_product_id", brandProductIds);
        const today = new Date().toISOString().slice(0, 10);
        const byBrandProduct: Record<string, SponsoredNote> = {};
        for (const link of (links ?? []) as unknown as Array<{
          brand_product_id: string;
          brand_offers: { id: string; headline: string | null; discount_code: string | null; ends_on: string | null; starts_on: string | null; status: string };
        }>) {
          const o = link.brand_offers;
          if (!o) continue;
          const live = o.status === "live"
            && (!o.starts_on || o.starts_on <= today)
            && (!o.ends_on || o.ends_on >= today);
          if (!live) continue;
          byBrandProduct[link.brand_product_id] = {
            offerId: o.id,
            brandProductId: link.brand_product_id,
            headline: o.headline ?? "",
            discountCode: o.discount_code,
            endsOn: o.ends_on,
          };
        }
        const byUserProduct: Record<string, SponsoredNote> = {};
        for (const p of list) {
          const note = p.linked_brand_product_id ? byBrandProduct[p.linked_brand_product_id] : undefined;
          if (note) byUserProduct[p.id] = note;
        }
        setSponsoredById(byUserProduct);
      } else {
        setSponsoredById({});
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  // Refresh whenever another part of the app signals that the user's product
  // data has changed (e.g. a rating was saved on IngredientDetail). Without
  // this, returning to a still-mounted list shows stale stars.
  //
  // Skipped in `static` mode (Home) — the list is loaded once on mount and
  // stays frozen until the user leaves and comes back.
  useEffect(() => {
    if (isStatic) return;
    const handler = () => { void load(); };
    window.addEventListener("user-products-updated", handler);
    window.addEventListener("strand:data-changed", handler);
    return () => {
      window.removeEventListener("user-products-updated", handler);
      window.removeEventListener("strand:data-changed", handler);
    };
  }, [load, isStatic]);

  // Realtime — the DB trigger bumps use_count / last_used_at whenever a wash
  // day is inserted, updated or deleted. Subscribe so "Times used" and
  // "Last used" refresh immediately across every screen without a manual
  // reload. Disabled in `static` mode.
  useEffect(() => {
    if (!user || isStatic) return;
    const channel = supabase
      .channel(`user_products:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_products", filter: `user_id=eq.${user.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, load, isStatic]);

  const filtered = (() => {
    switch (filter) {
      case "shelf":     return products.filter(p => p.on_shelf);
      case "wishlist":  return products.filter(p => p.on_wishlist);
      case "off-shelf": return products.filter(p => !p.on_shelf && p.previously_on_shelf);
      case "favourite": return products.filter(p => p.on_favourite);
      default:          return products;
    }
  })();

  const upsert = async (p: Partial<UserProduct> & { product_key: string; name: string }): Promise<UserProduct | null> => {
    if (!user) { toast.error("Please sign in"); return null; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = { ...p, user_id: user.id };
    // Provenance of the detail on this row. A row linked to an approved brand
    // catalogue product always inherits the brand's own ingredient list;
    // anything typed in by hand is 'manual'. Scan/link paths set their own.
    if (payload.linked_brand_product_id) payload.ingredients_source = "brand";
    else if (!payload.ingredients_source) payload.ingredients_source = "manual";
    const { data, error } = await supabase
      .from("user_products")
      .upsert(payload, { onConflict: "user_id,product_key" })
      .select()
      .single();
    if (error) {
      console.error("user_products upsert failed", error);
      toast.error("Could not save product");
      return null;
    }
    await load();
    return data as unknown as UserProduct;
  };

  const setShelf = async (id: string, on: boolean) => {
    const updates = on
      ? { on_shelf: true, on_wishlist: false, added_to_shelf_at: new Date().toISOString() }
      // Taking a product off the shelf also drops it from favourites — a
      // favourite is by definition something the user is actively using.
      : { on_shelf: false, previously_on_shelf: true, on_favourite: false };
    const { error } = await supabase.from("user_products").update(updates).eq("id", id);
    if (error) { toast.error("Could not update product"); return; }
    await load();
    // Off-shelf + favourite membership both feed the flag list — recompute.
    await recomputeIngredientFlags();
    if (!on && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("user-products-updated"));
    }
  };

  const setWishlist = async (id: string, on: boolean) => {
    const { error } = await supabase
      .from("user_products")
      .update({ on_wishlist: on, on_shelf: false })
      .eq("id", id);
    if (error) { toast.error("Could not update wishlist"); return; }
    await load();
  };

  const setFavourite = async (id: string, on: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = { on_favourite: on };
    const { error } = await supabase.from("user_products").update(updates).eq("id", id);
    if (error) { toast.error("Could not update favourite"); return; }
    await load();
    // Favourite membership feeds the Green Flag list — recompute.
    await recomputeIngredientFlags();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("user-products-updated"));
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("user_products").delete().eq("id", id);
    if (error) { toast.error("Could not delete product"); return; }
    await load();
    // Removed product may have been driving a flag — recompute both.
    await recomputeIngredientFlags();
  };

  // ---------- Batch operations ----------
  // All batch helpers accept an array of user_product row IDs and run a
  // single Supabase call. They mirror the semantics of the single-item
  // helpers (including favourite-cleanup when leaving the shelf) so that
  // downstream side effects — ingredient flags, realtime events — stay in
  // sync regardless of which entry point the user takes.
  const bulkSetShelf = async (ids: string[], on: boolean) => {
    if (!ids.length) return;
    const updates = on
      ? { on_shelf: true, on_wishlist: false, added_to_shelf_at: new Date().toISOString() }
      : { on_shelf: false, previously_on_shelf: true, on_favourite: false };
    const { error } = await supabase.from("user_products").update(updates).in("id", ids);
    if (error) { toast.error("Could not update products"); return; }
    await load();
    await recomputeIngredientFlags();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("user-products-updated"));
    }
  };

  const bulkSetWishlist = async (ids: string[], on: boolean) => {
    if (!ids.length) return;
    const { error } = await supabase
      .from("user_products")
      .update({ on_wishlist: on, on_shelf: false })
      .in("id", ids);
    if (error) { toast.error("Could not update wishlist"); return; }
    await load();
  };

  const bulkSetFavourite = async (ids: string[], on: boolean) => {
    if (!ids.length) return;
    const { error } = await supabase
      .from("user_products")
      .update({ on_favourite: on })
      .in("id", ids);
    if (error) { toast.error("Could not update favourites"); return; }
    await load();
    await recomputeIngredientFlags();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("user-products-updated"));
    }
  };

  const bulkRemove = async (ids: string[]) => {
    if (!ids.length) return;
    const { error } = await supabase.from("user_products").delete().in("id", ids);
    if (error) { toast.error("Could not delete products"); return; }
    await load();
    await recomputeIngredientFlags();
  };

  return {
    products: filtered,
    allProducts: products,
    sponsoredById,
    loading,
    upsert,
    setShelf,
    setWishlist,
    setFavourite,
    remove,
    reload: load,
    bulkSetShelf,
    bulkSetWishlist,
    bulkSetFavourite,
    bulkRemove,
  };
}

