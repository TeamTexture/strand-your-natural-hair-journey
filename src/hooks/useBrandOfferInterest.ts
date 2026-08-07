import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// The generated Supabase types haven't picked up the new table yet, so we
// cast against a loose client just for these calls.
const db = supabase as unknown as {
  from: (t: string) => any;
};

/** Has the signed-in user already registered interest in this offer? */
export function useMyOfferInterest(offerId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["brand-offer-interest", "mine", offerId, user?.id],
    enabled: !!offerId && !!user,
    queryFn: async (): Promise<boolean> => {
      const { data } = await db
        .from("brand_offer_interest")
        .select("id")
        .eq("offer_id", offerId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      return !!data;
    },
  });
}

/** Offers (ended) the signed-in member is currently waiting on. */
export function useMyWaitingOffers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["brand-offer-interest", "waiting", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await db
        .from("brand_offer_interest")
        .select("offer_id, created_at, brand_offers(id, headline, brand_user_id, status)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as Array<{
        offer_id: string;
        created_at: string;
        brand_offers: { id: string; headline: string | null; brand_user_id: string; status: string } | null;
      }>;
    },
  });
}

/** Register / withdraw interest for the current user on an expired offer.
 *  One row per (offer, user) — duplicate taps are treated as success. */
export function useRegisterOfferInterest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ offerId, interested }: { offerId: string; interested: boolean }) => {
      if (!user) throw new Error("Sign in required");
      if (interested) {
        const { error } = await db
          .from("brand_offer_interest")
          .insert({ offer_id: offerId, user_id: user.id });
        if (error && !/duplicate/i.test(error.message)) throw error;
      } else {
        const { error } = await db
          .from("brand_offer_interest")
          .delete()
          .eq("offer_id", offerId)
          .eq("user_id", user.id);
        if (error) throw error;
      }
      return { offerId, interested };
    },
    onSuccess: ({ offerId, interested }) => {
      qc.invalidateQueries({ queryKey: ["brand-offer-interest", "mine", offerId] });
      qc.invalidateQueries({ queryKey: ["brand-offer-interest", "waiting"] });
      qc.invalidateQueries({ queryKey: ["brand-offer-interest", "counts"] });
      toast.success(
        interested
          ? "Noted — the brand will see the demand."
          : "Removed from your waiting list.",
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save that"),
  });
}

interface InterestCount {
  total: number;
  unread: number; // rows newer than brand_last_interest_seen_at
}

/** Batched interest counts for a set of offers — for the brand/admin dashboards.
 *  Goes through a security-definer RPC so brands only ever receive counts:
 *  no member rows, and therefore no user ids, leave the database. Counts are
 *  exact (no audience floor) — interest is a voluntary, non-identifying action. */
export function useOfferInterestCounts(offerIds: string[]) {
  const key = offerIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["brand-offer-interest", "counts", key],
    enabled: offerIds.length > 0,
    queryFn: async (): Promise<Record<string, InterestCount>> => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
      }).rpc("brand_offer_interest_counts", { _offer_ids: offerIds });
      if (error) throw error;
      const map: Record<string, InterestCount> = {};
      offerIds.forEach((id) => (map[id] = { total: 0, unread: 0 }));
      (data ?? []).forEach((r: { offer_id: string; total: number; unread: number }) => {
        map[r.offer_id] = { total: r.total ?? 0, unread: r.unread ?? 0 };
      });
      return map;
    },
  });
}


/** Owner-only: mark this offer's interest inbox as "seen up to now" so the
 *  unread badge on the past card clears. Safe to call repeatedly. */
export function useMarkOfferInterestSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) => {
      const { error } = await db
        .from("brand_offers")
        .update({ brand_last_interest_seen_at: new Date().toISOString() })
        .eq("id", offerId);
      if (error) throw error;
      return offerId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-offer-interest", "counts"] });
    },
  });
}
