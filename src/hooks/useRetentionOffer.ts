import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { assertNotViewingAs } from "@/lib/viewAsReadOnly";

/**
 * One-time "keep my discount" retention offer: half price for 3 months.
 *
 * Eligibility is decided SERVER-SIDE by `consumer-retention-offer` from the
 * member's own subscription row — this hook only reports what the server says.
 * Claiming re-checks on the server, so a stale screen cannot claim twice.
 */
export interface RetentionOfferCheck {
  eligible: boolean;
  reason: string;
  tier: "standard" | "plus";
  price: number;
  discounted_price: number;
  months: number;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  // Billing acts as the SIGNED-IN user, so impersonation would hit the admin's
  // own membership. Refuse.
  assertNotViewingAs("Billing");
  const { data, error } = await supabase.functions.invoke("consumer-retention-offer", { body });
  if (error) throw new Error(error.message);
  const payload = data as { error?: string } | null;
  if (payload?.error) throw new Error(payload.error);
  return data as T;
}

export function retentionOfferKey(userId: string | undefined) {
  return ["retention_offer", userId] as const;
}

export function useRetentionOffer(enabled = true) {
  const { user, isViewingAs } = useAuth();
  return useQuery({
    queryKey: retentionOfferKey(user?.id),
    enabled: enabled && !!user?.id && !isViewingAs,
    staleTime: 60_000,
    retry: false,
    queryFn: () => invoke<RetentionOfferCheck>({ action: "check" }),
  });
}

export function useClaimRetentionOffer() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: () =>
      invoke<{ ok: true; discounted_price: number; months: number }>({ action: "claim" }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["consumer_subscription", user?.id] }),
        qc.invalidateQueries({ queryKey: retentionOfferKey(user?.id) }),
      ]);
    },
  });
}
