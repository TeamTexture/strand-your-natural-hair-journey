import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export type BrandProfile = Database["public"]["Tables"]["brand_profiles"]["Row"];
export type BrandOffer = Database["public"]["Tables"]["brand_offers"]["Row"];
export type BrandPlacement = Database["public"]["Tables"]["brand_offer_placements"]["Row"];
export type BrandProduct = Database["public"]["Tables"]["brand_products"]["Row"];
export type PlacementSlot = Database["public"]["Enums"]["brand_placement_slot"];
export type BrandOfferStatus = Database["public"]["Enums"]["brand_offer_status"];

export const SLOT_LABEL: Record<PlacementSlot, string> = {
  home: "Home banner",
  products: "Products banner",
  wash_day: "Wash day banner",
};

export const STATUS_LABEL: Record<BrandOfferStatus | "upcoming", string> = {
  draft: "Draft",
  under_review: "Under review",
  approved_unpaid: "Approved — payment required",
  paid_scheduled: "Paid — scheduled",
  upcoming: "Upcoming",
  live: "Live",
  ended: "Ended",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Display status derived from stored status + date window in Europe/London.
 *  This is the single source of truth for what the UI shows so paid+in-window
 *  offers always read as "Live" (matching what consumers see), paid+future as
 *  "Upcoming", and paid+past as "Ended" — regardless of whether a background
 *  job has flipped the stored `status` yet. */
export type DerivedStatus =
  | "draft"
  | "under_review"
  | "approved_unpaid"
  | "upcoming"
  | "live"
  | "ended"
  | "rejected"
  | "cancelled";

export function deriveBrandOfferStatus(
  offer: { status: BrandOfferStatus | string; starts_on?: string | null; ends_on?: string | null },
  today: string = londonToday(),
): DerivedStatus {
  const s = offer.status as string;
  if (s === "paid_scheduled" || s === "live") {
    if (offer.starts_on && today < offer.starts_on) return "upcoming";
    if (offer.ends_on && today > offer.ends_on) return "ended";
    // Missing dates fall through to "live" — same behaviour as consumer read.
    return "live";
  }
  if (s === "ended") return "ended";
  if (s === "draft" || s === "under_review" || s === "approved_unpaid" || s === "rejected" || s === "cancelled") {
    return s;
  }
  return s as DerivedStatus;
}

export function useBrandProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["brand-profile", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<BrandProfile | null> => {
      const { data, error } = await supabase
        .from("brand_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useBrandOffers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["brand-offers", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_offers")
        .select("*, brand_offer_placements(*), brand_products(*)")
        .eq("brand_user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBrandOffer(id: string | undefined) {
  return useQuery({
    queryKey: ["brand-offer", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_offers")
        .select("*, brand_offer_placements(*), brand_products(*), brand_offer_stats(*)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function usePlacementRates() {
  return useQuery({
    queryKey: ["brand-placement-rates"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<PlacementSlot, number>> => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "brand_placement_rates")
        .maybeSingle();
      const raw = (data?.value as Record<string, number>) ?? {};
      return {
        home: raw.home ?? 7500,
        products: raw.products ?? 5000,
        wash_day: raw.wash_day ?? 10000,
      };
    },
  });
}

/** Approved/paid/live placements from all brands so date pickers can block them. */
export function useTakenPlacements() {
  return useQuery({
    queryKey: ["brand-placements-taken"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_offer_placements")
        .select("slot, placement_date, offer_id, brand_offers!inner(status)")
        .in("brand_offers.status", ["approved_unpaid", "paid_scheduled", "live"]);
      if (error) throw error;
      return (data ?? []) as Array<{ slot: PlacementSlot; placement_date: string; offer_id: string }>;
    },
  });
}

/** Today's date in Europe/London as yyyy-mm-dd. Banner windows are London-based. */
export function londonToday(): string {
  // en-CA gives yyyy-mm-dd format.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

/** Paid+in-window offer holding a given slot today (for consumer banner).
 *  Read-time date logic: an offer is "live" from starts_on..ends_on inclusive
 *  regardless of whether the stored status has been flipped to `live` yet. */
export function useActiveBrandOffer(slot: PlacementSlot) {
  return useQuery({
    queryKey: ["active-brand-offer", slot, londonToday()],
    staleTime: 60_000,
    queryFn: async () => {
      const today = londonToday();
      const { data, error } = await supabase
        .from("brand_offer_placements")
        .select("offer_id, slot, brand_offers!inner(id, headline, body_copy, hero_image_path, external_url, discount_code, status, starts_on, ends_on, brand_user_id, brand_products(id, name, image_urls, external_url))")
        .eq("slot", slot)
        .eq("placement_date", today)
        .in("brand_offers.status", ["paid_scheduled", "live"])
        .lte("brand_offers.starts_on", today)
        .gte("brand_offers.ends_on", today)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** All currently paid+in-window offers for the profile Discounts area. */
export function useAllLiveBrandOffers() {
  return useQuery({
    queryKey: ["all-live-brand-offers", londonToday()],
    staleTime: 60_000,
    queryFn: async () => {
      const today = londonToday();
      const { data, error } = await supabase
        .from("brand_offers")
        .select("id, headline, body_copy, hero_image_path, external_url, discount_code, brand_user_id")
        .in("status", ["live", "paid_scheduled"])
        .lte("starts_on", today)
        .gte("ends_on", today);
      if (error) throw error;
      return data ?? [];
    },
  });
}


export function usePendingBrandOffersCount() {
  return useQuery({
    queryKey: ["admin", "pending-brand-offers"],
    staleTime: 30_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("brand_offers")
        .select("id", { count: "exact", head: true })
        .eq("status", "under_review");
      return count ?? 0;
    },
  });
}

/** Session-scoped impression dedupe: one impression per (offer, slot) per browser session. */
const impressionSeenKey = (offerId: string, slot: PlacementSlot | null) =>
  `strand:brand-stat:impression:${offerId}:${slot ?? "none"}`;

export function useLogBrandStat() {
  return useMutation({
    mutationFn: async ({
      offer_id,
      slot,
      kind,
    }: {
      offer_id: string;
      slot: PlacementSlot | null;
      kind: "impressions" | "taps" | "wishlist_adds" | "code_copies" | "link_clicks";
    }) => {
      // Dedupe impressions per (offer, slot) per session so re-renders / route
      // revisits don't inflate counts.
      if (kind === "impressions") {
        try {
          const k = impressionSeenKey(offer_id, slot);
          if (sessionStorage.getItem(k)) return;
          sessionStorage.setItem(k, "1");
        } catch { /* sessionStorage disabled — still log */ }
      }
      // Fire-and-forget atomic increment via SECURITY DEFINER RPC. Never blocks UI.
      const { error } = await supabase.rpc("increment_brand_offer_stat" as never, {
        _offer_id: offer_id,
        _slot: slot,
        _kind: kind,
      } as never);
      if (error) console.warn("brand stat log failed", error);
    },
  });
}

/** Aggregate totals across ALL users for the given offers. Backed by a SECURITY
 *  DEFINER function that only returns rows for offers owned by the caller (or admin). */
export function useBrandOfferTotals(offerIds: string[]) {
  const key = [...offerIds].sort().join(",");
  return useQuery({
    queryKey: ["brand-offer-totals", key],
    enabled: offerIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("brand_offer_totals" as never, { _offer_ids: offerIds } as never);
      if (error) throw error;
      const map: Record<string, { impressions: number; taps: number; wishlist_adds: number; code_copies: number; link_clicks: number }> = {};
      for (const row of (data ?? []) as Array<{ offer_id: string; impressions: number; taps: number; wishlist_adds: number; code_copies: number; link_clicks: number }>) {
        map[row.offer_id] = {
          impressions: Number(row.impressions ?? 0),
          taps: Number(row.taps ?? 0),
          wishlist_adds: Number(row.wishlist_adds ?? 0),
          code_copies: Number(row.code_copies ?? 0),
          link_clicks: Number(row.link_clicks ?? 0),
        };
      }
      return map;
    },
  });
}

export function useDeleteBrandOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("brand_offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand-offers"] }),
  });
}
