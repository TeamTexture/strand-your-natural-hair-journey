import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { verifyConsumerMembership } from "@/lib/membershipVerify";

export type ActivationState = "verifying" | "active" | "stuck";

const TIMEOUT_MS = 10_000;
const RETRY_MS = 2_000;

/**
 * Post-checkout membership activation.
 *
 * Asks Stripe for the truth rather than waiting on the webhook, invalidates the
 * paywall's own query keys, and holds the caller in a "verifying" state until
 * access is confirmed. A member who has paid must never be dropped on the
 * subscribe page, so after ~10 seconds we surface a "Try again" state instead.
 */
export function useMembershipActivation(enabled = true) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { hasAccess, isLoading } = useConsumerSubscription();
  const [state, setState] = useState<ActivationState>(enabled ? "verifying" : "active");
  const startedAt = useRef<number>(Date.now());

  const runVerification = useCallback(async () => {
    await verifyConsumerMembership(qc, user?.id);
  }, [qc, user?.id]);

  const retry = useCallback(() => {
    startedAt.current = Date.now();
    setState("verifying");
    void runVerification();
  }, [runVerification]);

  // Always verify once on mount, even when access already looks granted — an
  // upgrade (e.g. standard → STRAND+) changes the tier, not the access flag.
  useEffect(() => {
    if (!enabled || !user?.id) return;
    void runVerification();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id]);

  // Confirmed access always wins, whatever the timers are doing.
  useEffect(() => {
    if (hasAccess) setState("active");
  }, [hasAccess]);

  useEffect(() => {
    if (!enabled || !user?.id) return;
    if (hasAccess) return;
    if (state !== "verifying") return;

    void runVerification();
    const poll = window.setInterval(() => void runVerification(), RETRY_MS);
    const giveUp = window.setTimeout(() => setState("stuck"), TIMEOUT_MS);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id, hasAccess, state]);

  return {
    state: hasAccess ? ("active" as ActivationState) : state,
    hasAccess,
    isLoading,
    retry,
    verify: runVerification,
  };
}
