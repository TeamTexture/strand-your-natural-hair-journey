// Shelf-product engagement: the member-side lookup of live offers tagging a
// shelf product, and the brand-side engagement figures for their own shelf.
//
// Attribution model (see useLogAdEvent): a product interaction always carries
// `brand_product_id`, and additionally carries `offer_id` when a live campaign
// has tagged that product — so the same tap lands in the campaign's metrics and
// in the shelf figures without a second event stream.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ProductLiveOffer {
  offer_id: string;
  discount_code: string | null;
  external_url: string | null;
  headline: string | null;
}

/** Live (or paid-scheduled, in-window) offers that have tagged these shelf
 *  products, keyed by brand_product_id. RLS only exposes offers inside their
 *  paid window, so nothing here can surface a draft or ended campaign. */
export function useLiveOffersForProducts(brandProductIds: string[]) {
  const ids = [...brandProductIds].sort();
  return useQuery({
    queryKey: ["live-offers-for-products", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, ProductLiveOffer>> => {
      const { data, error } = await supabase
        .from("brand_offer_products")
        .select(
          "brand_product_id, offer_id, brand_offers!inner(id, status, discount_code, external_url, headline)",
        )
        .in("brand_product_id", ids);
      if (error) throw error;
      const out: Record<string, ProductLiveOffer> = {};
      type Row = {
        brand_product_id: string;
        offer_id: string;
        brand_offers: {
          status: string;
          discount_code: string | null;
          external_url: string | null;
          headline: string | null;
        } | null;
      };
      for (const row of (data ?? []) as unknown as Row[]) {
        const o = row.brand_offers;
        // Only a genuinely live campaign may show a code on a shelf card.
        if (!o || o.status !== "live") continue;
        if (out[row.brand_product_id]) continue;
        out[row.brand_product_id] = {
          offer_id: row.offer_id,
          discount_code: o.discount_code,
          external_url: o.external_url,
          headline: o.headline,
        };
      }
      return out;
    },
  });
}

export interface ShelfEngagementRow {
  brand_product_id: string;
  name: string;
  shelf_count: number | null;
  wishlist_count: number | null;
  favourite_count: number | null;
  expands: number | null;
  code_copies: number | null;
  link_clicks: number | null;
  suppressed: boolean;
  min_threshold: number;
}

/**
 * Brand-side shelf engagement. Suppression below the member floor is enforced
 * inside the database function — anything under the threshold returns NULL with
 * `suppressed` true. Counts only: no user ids are returned or reachable here.
 */
export function useBrandShelfEngagement() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["brand-shelf-engagement", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ShelfEngagementRow[]> => {
      const { data, error } = await supabase.rpc("brand_shelf_engagement" as never, {
        _brand_user_id: user!.id,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as ShelfEngagementRow[];
    },
  });
}

/** Shelf totals across every product, derived client-side from the already
 *  suppressed per-product figures so no unsuppressed number is ever fetched. */
export function shelfEngagementTotals(rows: ShelfEngagementRow[]) {
  const sum = (pick: (r: ShelfEngagementRow) => number | null) =>
    rows.reduce<number | null>((acc, r) => {
      const v = pick(r);
      if (v == null) return acc;
      return (acc ?? 0) + v;
    }, null);
  return {
    shelf_count: sum((r) => r.shelf_count),
    wishlist_count: sum((r) => r.wishlist_count),
    favourite_count: sum((r) => r.favourite_count),
    expands: sum((r) => r.expands),
    code_copies: sum((r) => r.code_copies),
    link_clicks: sum((r) => r.link_clicks),
  };
}
