import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { recomputeIngredientFlags } from "@/hooks/useIngredientLists";
import { toast } from "sonner";

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
}

type Filter = "shelf" | "wishlist" | "off-shelf" | "favourite" | "all";

/** Loads the current user's products. Filter is applied client-side. */
export function useUserProducts(filter: Filter = "all") {
  const { user } = useAuth();
  const [products, setProducts] = useState<UserProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("user_products")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("user_products load failed", error);
      setProducts([]);
    } else {
      setProducts((data as unknown as UserProduct[]) ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  // Refresh whenever another part of the app signals that the user's product
  // data has changed (e.g. a rating was saved on IngredientDetail). Without
  // this, returning to a still-mounted list shows stale stars.
  useEffect(() => {
    const handler = () => { void load(); };
    window.addEventListener("user-products-updated", handler);
    window.addEventListener("strand:data-changed", handler);
    return () => {
      window.removeEventListener("user-products-updated", handler);
      window.removeEventListener("strand:data-changed", handler);
    };
  }, [load]);

  // Realtime — the DB trigger bumps use_count / last_used_at whenever a wash
  // day is inserted, updated or deleted. Subscribe so "Times used" and
  // "Last used" refresh immediately across every screen without a manual
  // reload.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user_products:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_products", filter: `user_id=eq.${user.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, load]);

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

