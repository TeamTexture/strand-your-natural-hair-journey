import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { assertNotViewingAs } from "@/lib/viewAsReadOnly";
import { friendlyInvokeError } from "@/lib/invokeError";

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
  /** True when the member has already claimed the one-time retention offer. */
  already_used: boolean;
  tier: "standard" | "plus";
  /** True when the member is still on the free trial (nothing charged yet). */
  trialing?: boolean;
  trial_end?: string | null;
  price: number;
  discounted_price: number;
  months: number;
}

/**
 * Nothing on this path may hang forever. The claim button sat on "Applying…"
 * indefinitely, so every invoke is bounded by a hard client-side timeout and
 * resolves into a friendly, readable message either way.
 */
const INVOKE_TIMEOUT_MS = 20_000;

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  // Billing acts as the SIGNED-IN user, so impersonation would hit the admin's
  // own membership. Refuse.
  assertNotViewingAs("Billing");
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, INVOKE_TIMEOUT_MS);
  let data: unknown;
  let error: unknown;
  try {
    ({ data, error } = await supabase.functions.invoke("consumer-retention-offer", {
      body,
      signal: controller.signal,
    }));
  } catch (e) {
    error = e;
  } finally {
    clearTimeout(timer);
  }
  if (timedOut) {
    throw new Error(
      "This is taking longer than expected. Your membership has not been changed and nothing has been charged — please try again.",
    );
  }
  if (error) {
    // The server's own sentence when it sent one (offer already used, billing
    // unreachable, invalid promotion); a written fallback otherwise. The raw SDK
    // string "Edge Function returned a non-2xx status code" never reaches here.
    throw new Error(
      await friendlyInvokeError(
        error,
        "We couldn't reach your membership just now, so nothing has changed. Please check your connection and try again.",
      ),
    );
  }
  const payload = data as { error?: string; message?: string } | null;
  if (payload?.error || payload?.message) {
    throw new Error(
      String(payload.message ?? payload.error),
    );
  }
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
    // NEVER await the refetches here. `mutation.isPending` stays true until this
    // callback's promise settles, and `invalidateQueries` only resolves once the
    // dependent queries have refetched — a paused/disabled/slow refetch left the
    // button on "Applying…" forever even though Stripe and the database had both
    // already succeeded. Refresh in the background instead.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["consumer_subscription", user?.id] });
      void qc.invalidateQueries({ queryKey: retentionOfferKey(user?.id) });
    },

  });
}
