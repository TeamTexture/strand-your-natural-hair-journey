import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { friendlyInvokeError } from "@/lib/invokeError";
import { useAuth } from "@/hooks/useAuth";
import { assertNotViewingAs } from "@/lib/viewAsReadOnly";
import { myProfileKey } from "@/hooks/useMyProfile";

/**
 * Account lifecycle actions a member can take on themselves: pause and resume
 * their membership, open the Stripe billing portal, and request or cancel
 * erasure of their own account.
 *
 * Nothing here destroys data. A deletion request only stamps a date — the
 * scheduled erasure job acts 30 days later, and cancelling before then restores
 * everything untouched.
 */
export const DELETION_GRACE_DAYS = 30;

export function erasureDate(requestedAt: string | null | undefined): Date | null {
  if (!requestedAt) return null;
  const d = new Date(requestedAt);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + DELETION_GRACE_DAYS);
  return d;
}

export function formatLongDate(d: Date | null): string | null {
  return d
    ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
}

function useRefreshAccess() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["consumer_subscription", user?.id] }),
      qc.invalidateQueries({ queryKey: myProfileKey(user?.id) }),
    ]);
  };
}

async function invoke<T>(fn: string, body?: Record<string, unknown>): Promise<T> {
  // Every lifecycle/billing function authenticates as the SIGNED-IN user, so
  // during impersonation it would act on the admin's own account. Refuse.
  assertNotViewingAs("Billing");
  const { data, error } = await supabase.functions.invoke(fn, { body: body ?? {} });
  // Read the server's own JSON body — `error.message` is only ever the SDK's
  // generic "Edge Function returned a non-2xx status code".
  if (error) {
    throw new Error(
      await friendlyInvokeError(
        error,
        "We couldn't reach your membership just now, so nothing has changed. Please try again.",
      ),
    );
  }
  const payload = data as { error?: string } | null;
  if (payload?.error) throw new Error(payload.error);
  return data as T;
}


/** Pause collection on the membership (Stripe `pause_collection`, behaviour void). */
export function usePauseMembership() {
  const refresh = useRefreshAccess();
  return useMutation({
    mutationFn: () => invoke<{ ok: true }>("consumer-pause-subscription", { action: "pause" }),
    onSuccess: refresh,
  });
}

/** Resume a paused membership — access comes back immediately. */
export function useResumeMembership() {
  const refresh = useRefreshAccess();
  return useMutation({
    mutationFn: () => invoke<{ ok: true }>("consumer-pause-subscription", { action: "resume" }),
    onSuccess: refresh,
  });
}

/** Stripe billing portal — cancellation, payment method, invoice history. */
export type BillingPortalFlow = "subscription_update" | "subscription_cancel" | "portal";

export function useBillingPortal() {
  return useMutation({
    mutationFn: async (input?: string | { returnPath?: string; flow?: BillingPortalFlow }) => {
      const returnPath = typeof input === "string"
        ? input
        : input?.returnPath;
      const flow = typeof input === "string"
        ? undefined
        : input?.flow;
      const res = await invoke<{ url: string }>("consumer-portal", {
        return_path: returnPath ?? "/profile/data-access",
        flow: flow ?? "portal",
      });
      if (!res?.url) throw new Error("Could not open the billing portal");
      window.location.href = res.url;
      return res;
    },
  });
}

/** Ask for erasure. Nothing is deleted now — the 30-day clock starts. */
export function useRequestAccountDeletion() {
  const refresh = useRefreshAccess();
  return useMutation({
    mutationFn: () =>
      invoke<{ ok: true; erase_on: string }>("consumer-account-deletion", {
        action: "request",
      }),
    onSuccess: refresh,
  });
}

/** Cancel a pending erasure request. Everything is restored as it was. */
export function useCancelAccountDeletion() {
  const refresh = useRefreshAccess();
  return useMutation({
    mutationFn: () =>
      invoke<{ ok: true }>("consumer-account-deletion", { action: "cancel" }),
    onSuccess: refresh,
  });
}
