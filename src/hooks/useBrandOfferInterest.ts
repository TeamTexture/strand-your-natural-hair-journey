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

/** Register interest for the current user on an expired offer.
 *  One row per (offer, user) — duplicate taps are treated as success. */
export function useRegisterOfferInterest() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offerId: string) => {
      if (!user) throw new Error("Sign in required");
      const { error } = await db
        .from("brand_offer_interest")
        .insert({ offer_id: offerId, user_id: user.id });
      if (error && !/duplicate/i.test(error.message)) throw error;
      return offerId;
    },
    onSuccess: (offerId) => {
      qc.invalidateQueries({ queryKey: ["brand-offer-interest", "mine", offerId] });
      qc.invalidateQueries({ queryKey: ["brand-offer-interest", "counts"] });
      toast.success("Interest registered — the brand will hear about it.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not register interest"),
  });
}

interface InterestCount {
  total: number;
  unread: number; // rows newer than brand_last_interest_seen_at
}

/** Batched interest counts for a set of offers — for the brand/admin dashboards.
 *  `unread` compares row created_at against each offer's brand_last_interest_seen_at
 *  so past cards can surface a fresh-interest badge. */
export function useOfferInterestCounts(offerIds: string[]) {
  const key = offerIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["brand-offer-interest", "counts", key],
    enabled: offerIds.length > 0,
    queryFn: async (): Promise<Record<string, InterestCount>> => {
      const [rowsRes, offersRes] = await Promise.all([
        db
          .from("brand_offer_interest")
          .select("offer_id, created_at")
          .in("offer_id", offerIds),
        db
          .from("brand_offers")
          .select("id, brand_last_interest_seen_at")
          .in("id", offerIds),
      ]);
      const seenBy: Record<string, string | null> = {};
      (offersRes.data ?? []).forEach((o: { id: string; brand_last_interest_seen_at: string | null }) => {
        seenBy[o.id] = o.brand_last_interest_seen_at;
      });
      const map: Record<string, InterestCount> = {};
      offerIds.forEach((id) => (map[id] = { total: 0, unread: 0 }));
      (rowsRes.data ?? []).forEach((r: { offer_id: string; created_at: string }) => {
        const entry = map[r.offer_id];
        if (!entry) return;
        entry.total += 1;
        const seen = seenBy[r.offer_id];
        if (!seen || new Date(r.created_at) > new Date(seen)) entry.unread += 1;
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
