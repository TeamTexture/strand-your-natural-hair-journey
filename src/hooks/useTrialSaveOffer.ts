import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { assertNotViewingAs } from "@/lib/viewAsReadOnly";
import { friendlyInvokeError } from "@/lib/invokeError";

/**
 * The FIRST trial save screen: 7 more free days, one time only, for a member
 * still on her initial free trial who has not been charged.
 *
 * Eligibility (including the never-charged check against Stripe) is decided
 * SERVER-SIDE by `consumer-trial-save-offer`. This hook only reports what the
 * server says; claiming re-checks there.
 */
export type TrialFactCategory = "porosity_scalp" | "areas_of_concern" | "curl_pattern";

export interface TrialSavePersonalisation {
  category: TrialFactCategory | null;
  factLine: string | null;
  reasonLine: string | null;
  action: "log_wash_day" | "scan_product" | null;
  noActivity: boolean;
}

export interface TrialSaveOfferCheck {
  eligible: boolean;
  reason: string;
  already_used: boolean;
  tier: "standard" | "plus";
  trial_end: string | null;
  /** Where the trial would end once the 7 days are added. */
  new_trial_end: string | null;
  extra_days: number;
  personalisation: TrialSavePersonalisation | null;
}

/** Nothing on the billing path may hang forever. */
const INVOKE_TIMEOUT_MS = 20_000;

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
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
    ({ data, error } = await supabase.functions.invoke("consumer-trial-save-offer", {
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
    throw new Error(
      await friendlyInvokeError(
        error,
        "We couldn't reach your membership just now, so nothing has changed. Please check your connection and try again.",
      ),
    );
  }
  const payload = data as { error?: string; message?: string } | null;
  if (payload?.error || payload?.message) throw new Error(String(payload.message ?? payload.error));
  return data as T;
}

export function trialSaveOfferKey(userId: string | undefined) {
  return ["trial_save_offer", userId] as const;
}

export function useTrialSaveOffer(enabled = true) {
  const { user, isViewingAs } = useAuth();
  return useQuery({
    queryKey: trialSaveOfferKey(user?.id),
    enabled: enabled && !!user?.id && !isViewingAs,
    staleTime: 60_000,
    retry: false,
    queryFn: () => invoke<TrialSaveOfferCheck>({ action: "check" }),
  });
}

export function useClaimTrialSaveOffer() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: () => invoke<{ ok: true; extra_days: number; trial_end: string | null }>({
      action: "claim",
    }),
    // Never await the refetches — the button must never stay on "Applying…"
    // after Stripe and the database have both already succeeded.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["consumer_subscription", user?.id] });
      void qc.invalidateQueries({ queryKey: trialSaveOfferKey(user?.id) });
      void qc.invalidateQueries({ queryKey: ["retention_offer", user?.id] });
    },
  });
}

/**
 * Turning the offer down burns it too — the screen is one time whether she takes
 * the days or not. This must never block her cancel, so failures are swallowed.
 */
export function useDeclineTrialSaveOffer() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      try {
        await invoke<{ ok: true }>({ action: "decline" });
      } catch {
        /* never block the cancel */
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: trialSaveOfferKey(user?.id) });
      void qc.invalidateQueries({ queryKey: ["retention_offer", user?.id] });
    },
  });
}
