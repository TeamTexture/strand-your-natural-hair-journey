// Eligibility + writes for the personalised-offers ask on /home.
//
// Rules (deliberate, do not loosen):
//  • Only shown once a subscription EXISTS — trialing or active. It is never
//    part of onboarding and never blocks anything.
//  • Answered once, ever. Either answer writes personalised_offers_consent and
//    stamps consent_updated_at, then the card never returns.
//  • Dismissed without answering leaves the stored value untouched and may show
//    ONE more time (prompt count < 2), never more.
//  • Bookkeeping uses the existing profiles prompt-seen idiom
//    (personalised_offers_prompt_seen_at / _count / _answered_at).

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useSetPersonalisedOffersConsent } from "@/hooks/useAdTargeting";

/* eslint-disable @typescript-eslint/no-explicit-any */
const table = (name: string) => (supabase as unknown as { from: (t: string) => any }).from(name);
const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase as unknown as { rpc: (n: string, a?: Record<string, unknown>) => Promise<{ error: { message: string } | null }> })
    .rpc(name, args);

const MAX_SHOWS = 2;

export interface OffersPromptState {
  count: number;
  answeredAt: string | null;
}

export const offersPromptKey = (userId?: string) =>
  ["personalised-offers-prompt", userId] as const;

export function usePersonalisedOffersCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { subscription, isLoading: subLoading } = useConsumerSubscription();
  const setConsent = useSetPersonalisedOffersConsent();

  const state = useQuery({
    queryKey: offersPromptKey(user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<OffersPromptState> => {
      const { data, error } = await table("profiles")
        .select("personalised_offers_prompt_count, personalised_offers_answered_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = (data ?? null) as
        | { personalised_offers_prompt_count?: number | null; personalised_offers_answered_at?: string | null }
        | null;
      return {
        count: row?.personalised_offers_prompt_count ?? 0,
        answeredAt: row?.personalised_offers_answered_at ?? null,
      };
    },
  });

  const subscribed =
    !!subscription && (subscription.status === "trialing" || subscription.status === "active");

  const eligible =
    !subLoading &&
    !state.isLoading &&
    subscribed &&
    !state.data?.answeredAt &&
    (state.data?.count ?? 0) < MAX_SHOWS;

  const ack = useCallback(
    async (answered: boolean) => {
      await rpc("personalised_offers_prompt_ack", { _answered: answered });
      await qc.invalidateQueries({ queryKey: offersPromptKey(user?.id) });
    },
    [qc, user?.id],
  );

  /** Records her answer, syncs Klaviyo, and retires the card for good. */
  const answer = useCallback(
    async (on: boolean) => {
      await setConsent.mutateAsync({ on, source: "settings" });
      await ack(true);
      // Keep Klaviyo in step with the answer. Fire-and-forget by design.
      try {
        await supabase.functions.invoke("klaviyo-member-sync", { body: { mode: "consent" } });
      } catch {
        /* never block the member on a list sync */
      }
    },
    [ack, setConsent],
  );

  return { eligible, answer, dismiss: () => ack(false) };
}
