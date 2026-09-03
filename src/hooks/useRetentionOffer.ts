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

/**
 * `supabase.functions.invoke()` does NOT put the JSON body of a non-2xx
 * response on `error.message` — it reports "Edge Function returned a non-2xx
 * status code" and hangs the real Response off `error.context`. The member was
 * therefore shown that raw string instead of the friendly server sentence
 * ("This offer has already been used on your membership."). Read the body.
 */
async function serverMessage(error: unknown): Promise<string | null> {
  const res = (error as { context?: unknown })?.context;
  // FunctionsHttpError carries the actual Response; a network failure does not.
  if (!res || typeof (res as Response).text !== "function") return null;
  try {
    const raw = await (res as Response).clone().text();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
      const msg = parsed?.error ?? parsed?.message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    } catch {
      // Not JSON — a short plain-text body is still better than the generic
      // string, but never surface an HTML error page to the member.
      const text = raw.trim();
      if (text && text.length <= 200 && !text.startsWith("<")) return text;
    }
    return null;
  } catch {
    return null;
  }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  // Billing acts as the SIGNED-IN user, so impersonation would hit the admin's
  // own membership. Refuse.
  assertNotViewingAs("Billing");
  const { data, error } = await supabase.functions.invoke("consumer-retention-offer", { body });
  if (error) {
    // Generic fallback ONLY when there is genuinely no body to read (network
    // failure, CORS, function unreachable).
    throw new Error(
      (await serverMessage(error)) ??
        "We couldn't reach your membership just now. Please check your connection and try again.",
    );
  }
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
