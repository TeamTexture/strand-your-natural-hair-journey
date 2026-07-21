import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

/** Subscribe to brand_offers/brand_products changes so an admin-approved
 *  revision propagates to every open consumer client without a manual refresh. */
function useBrandOfferLiveSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("brand-offers-live-sync")
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "brand_offers" }, () => {
        qc.invalidateQueries({ queryKey: ["active-brand-offer"] });
        qc.invalidateQueries({ queryKey: ["all-live-brand-offers"] });
        qc.invalidateQueries({ queryKey: ["brand-offer"] });
      })
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "brand_products" }, () => {
        qc.invalidateQueries({ queryKey: ["active-brand-offer"] });
        qc.invalidateQueries({ queryKey: ["brand-offer"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}

export type BrandProfile = Database["public"]["Tables"]["brand_profiles"]["Row"];
export type BrandOffer = Database["public"]["Tables"]["brand_offers"]["Row"];
export type BrandPlacement = Database["public"]["Tables"]["brand_offer_placements"]["Row"];
export type BrandProduct = Database["public"]["Tables"]["brand_products"]["Row"];
export type PlacementSlot = Database["public"]["Enums"]["brand_placement_slot"];
export type BrandOfferStatus = Database["public"]["Enums"]["brand_offer_status"];

/** Revision row shape (creative-only edit awaiting review). Generated types will
 *  catch up on next codegen; keep this local type in sync with the migration. */
export interface BrandOfferRevision {
  id: string;
  offer_id: string;
  brand_user_id: string;
  status: "pending" | "approved" | "rejected" | "withdrawn" | "superseded";
  headline: string | null;
  body_copy: string | null;
  discount_code: string | null;
  external_url: string | null;
  hero_image_path: string | null;
  products: RevisionProductSnapshot[];
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RevisionProductSnapshot {
  kind: "product" | "tool";
  name: string;
  description?: string | null;
  external_url?: string | null;
  image_urls?: string[];
  ingredients?: string[];
  tool_kind?: string | null;
  key_features?: string[];
  materials?: string[];
  source_type?: "manual" | "ai" | "linked";
  source_url?: string | null;
  linked_product_id?: string | null;
}


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

export function useBrandOffers(ownerType: "brand" | "pro" = "brand") {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["brand-offers", ownerType, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_offers")
        .select("*, brand_offer_placements(*), brand_products(*)")
        .eq("brand_user_id", user!.id)
        .eq("owner_type", ownerType)
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
      // Uses a SECURITY DEFINER RPC so brands can see slot+date pairs held by
      // other brands' offers that are still under_review (RLS hides those
      // rows directly to protect competitors' creative). Without this,
      // brands could double-book pending slots.
      const { data, error } = await supabase.rpc("brand_taken_placements");
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        slot: row.slot as PlacementSlot,
        placement_date: row.placement_date as string,
        offer_id: row.offer_id as string,
        status: row.status as BrandOfferStatus,
      }));
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
  useBrandOfferLiveSync();
  return useQuery({
    queryKey: ["active-brand-offer", slot, londonToday()],
    staleTime: 15_000,
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
  useBrandOfferLiveSync();
  return useQuery({
    queryKey: ["all-live-brand-offers", londonToday()],
    staleTime: 15_000,
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


/** Admin queue badge: new offers awaiting review PLUS pending creative revisions
 *  on already-live offers. Both flow through the same admin review area. */
export function usePendingBrandOffersCount() {
  return useQuery({
    queryKey: ["admin", "pending-brand-offers"],
    staleTime: 30_000,
    queryFn: async () => {
      const [{ count: offerCount }, { count: revisionCount }] = await Promise.all([
        supabase.from("brand_offers").select("id", { count: "exact", head: true }).eq("status", "under_review"),
        (supabase as unknown as {
          from: (t: string) => { select: (c: string, opts: { count: "exact"; head: true }) => { eq: (c: string, v: string) => Promise<{ count: number | null }> } };
        }).from("brand_offer_revisions").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      return (offerCount ?? 0) + (revisionCount ?? 0);
    },
  });
}

/** Pending revision for a single offer (0 or 1). */
export function usePendingRevision(offerId: string | undefined) {
  return useQuery({
    queryKey: ["brand-offer-revision", "pending", offerId],
    enabled: !!offerId,
    queryFn: async (): Promise<BrandOfferRevision | null> => {
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: BrandOfferRevision | null; error: { message: string } | null }> } } };
        };
      };
      const { data, error } = await client.from("brand_offer_revisions").select("*").eq("offer_id", offerId!).eq("status", "pending").maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

/** All revision history for a single offer (newest first). */
export function useOfferRevisions(offerId: string | undefined) {
  return useQuery({
    queryKey: ["brand-offer-revisions", offerId],
    enabled: !!offerId,
    queryFn: async (): Promise<BrandOfferRevision[]> => {
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => { eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: BrandOfferRevision[] | null; error: { message: string } | null }> } };
        };
      };
      const { data, error } = await client.from("brand_offer_revisions").select("*").eq("offer_id", offerId!).order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** All pending revisions across all brands (admin). */
export function useAllPendingRevisions() {
  return useQuery({
    queryKey: ["admin", "all-pending-brand-revisions"],
    staleTime: 30_000,
    queryFn: async (): Promise<BrandOfferRevision[]> => {
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => { eq: (c: string, v: string) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: BrandOfferRevision[] | null; error: { message: string } | null }> } };
        };
      };
      const { data, error } = await client.from("brand_offer_revisions").select("*").eq("status", "pending").order("submitted_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Brand-side: id-set of offers that have a pending revision (for dashboard badges). */
export function useOffersWithPendingRevisions(offerIds: string[]) {
  const key = [...offerIds].sort().join(",");
  return useQuery({
    queryKey: ["brand-offers-with-pending-revisions", key],
    enabled: offerIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => { in: (c: string, v: string[]) => { eq: (c: string, v: string) => Promise<{ data: Array<{ offer_id: string }> | null; error: { message: string } | null }> } };
        };
      };
      const { data, error } = await client.from("brand_offer_revisions").select("offer_id").in("offer_id", offerIds).eq("status", "pending");
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((r) => r.offer_id));
    },
  });
}

/** Revision counts (any status) per offer id — for "Revised · N" badges on lists. */
export function useOfferRevisionCounts(offerIds: string[]) {
  const key = [...offerIds].sort().join(",");
  return useQuery({
    queryKey: ["brand-offers-revision-counts", key],
    enabled: offerIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => { in: (c: string, v: string[]) => Promise<{ data: Array<{ offer_id: string }> | null; error: { message: string } | null }> };
        };
      };
      const { data, error } = await client.from("brand_offer_revisions").select("offer_id").in("offer_id", offerIds);
      if (error) throw new Error(error.message);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r) => { counts[r.offer_id] = (counts[r.offer_id] ?? 0) + 1; });
      return counts;
    },
  });
}


export function useSubmitBrandOfferRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      offer_id: string;
      headline: string | null;
      body_copy: string | null;
      discount_code: string | null;
      external_url: string | null;
      hero_image_path: string | null;
      products: RevisionProductSnapshot[];
    }) => {
      const { data, error } = await supabase.rpc("submit_brand_offer_revision" as never, {
        _offer_id: args.offer_id,
        _headline: args.headline,
        _body_copy: args.body_copy,
        _discount_code: args.discount_code,
        _external_url: args.external_url,
        _hero_image_path: args.hero_image_path,
        _products: args.products as unknown as never,
      } as never);
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (_id, args) => {
      qc.invalidateQueries({ queryKey: ["brand-offer-revision", "pending", args.offer_id] });
      qc.invalidateQueries({ queryKey: ["brand-offer-revisions", args.offer_id] });
      qc.invalidateQueries({ queryKey: ["brand-offer", args.offer_id] });
      qc.invalidateQueries({ queryKey: ["brand-offers"] });
      qc.invalidateQueries({ queryKey: ["admin", "pending-brand-offers"] });
      qc.invalidateQueries({ queryKey: ["admin", "all-pending-brand-revisions"] });
    },
  });
}

export function useWithdrawBrandOfferRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ revision_id }: { revision_id: string; offer_id: string }) => {
      const { error } = await supabase.rpc("withdraw_brand_offer_revision" as never, { _revision_id: revision_id } as never);
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      qc.invalidateQueries({ queryKey: ["brand-offer-revision", "pending", args.offer_id] });
      qc.invalidateQueries({ queryKey: ["brand-offer-revisions", args.offer_id] });
      qc.invalidateQueries({ queryKey: ["admin", "pending-brand-offers"] });
      qc.invalidateQueries({ queryKey: ["admin", "all-pending-brand-revisions"] });
    },
  });
}

export function useApproveBrandOfferRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ revision_id }: { revision_id: string; offer_id: string }) => {
      const { error } = await supabase.rpc("approve_brand_offer_revision" as never, { _revision_id: revision_id } as never);
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      qc.invalidateQueries({ queryKey: ["brand-offer", args.offer_id] });
      qc.invalidateQueries({ queryKey: ["brand-offers"] });
      qc.invalidateQueries({ queryKey: ["brand-offer-revision", "pending", args.offer_id] });
      qc.invalidateQueries({ queryKey: ["brand-offer-revisions", args.offer_id] });
      qc.invalidateQueries({ queryKey: ["admin", "pending-brand-offers"] });
      qc.invalidateQueries({ queryKey: ["admin", "all-pending-brand-revisions"] });
      qc.invalidateQueries({ queryKey: ["admin", "brand-offers"] });
      qc.invalidateQueries({ queryKey: ["active-brand-offer"] });
      qc.invalidateQueries({ queryKey: ["all-live-brand-offers"] });
    },
  });
}

export function useRejectBrandOfferRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ revision_id, reason }: { revision_id: string; offer_id: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_brand_offer_revision" as never, { _revision_id: revision_id, _reason: reason } as never);
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      qc.invalidateQueries({ queryKey: ["brand-offer-revision", "pending", args.offer_id] });
      qc.invalidateQueries({ queryKey: ["brand-offer-revisions", args.offer_id] });
      qc.invalidateQueries({ queryKey: ["admin", "pending-brand-offers"] });
      qc.invalidateQueries({ queryKey: ["admin", "all-pending-brand-revisions"] });
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
