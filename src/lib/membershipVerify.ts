import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";
import { myProfileKey } from "@/hooks/useMyProfile";


/**
 * Ask Stripe (via the `consumer-verify-subscription` edge function) for the
 * caller's true subscription state, write it to `consumer_subscriptions`, then
 * invalidate the exact react-query keys the paywall reads.
 *
 * The keys MUST match `useConsumerSubscription` (["consumer_subscription", id])
 * and `usePlusAccess` (["plus_access", id]) — refetching anything else is the
 * bug this exists to fix.
 */
export async function verifyConsumerMembership(
  qc: QueryClient,
  userId: string | undefined,
): Promise<boolean> {
  let active = false;
  try {
    const { data, error } = await supabase.functions.invoke("consumer-verify-subscription", {
      body: {},
    });
    if (error) throw error;
    active = !!(data as { active?: boolean } | null)?.active;
  } catch (e) {
    console.warn("membership verification failed", e);
  }
  if (userId) {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["consumer_subscription", userId] }),
      qc.invalidateQueries({ queryKey: ["plus_access", userId] }),
      qc.invalidateQueries({ queryKey: myProfileKey(userId) }),
    ]);
  } else {
    await qc.invalidateQueries({ queryKey: ["consumer_subscription"] });
    await qc.invalidateQueries({ queryKey: ["plus_access"] });
  }
  return active;
}
