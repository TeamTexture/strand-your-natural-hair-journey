// Eligibility for the ONE-TIME personalised-offers ask shown straight after the
// hair profile is completed.
//
// Rules (deliberate, do not loosen):
//  • Ask only if `personalised_offers` has NEVER been ANSWERED — granted or
//    declined. An answered consent is never re-prompted; it is changed from
//    Personalised offers in the member's own settings instead.
//  • My STRAND only. It is a member consent and must not surface in the
//    professional, brand or admin views.
//  • Ask once. The decline/dismiss is written to `alert_dismissals`, so it
//    survives reload and navigation — component state was the old bug.
//  • The ask never gates anything; declining changes nothing about access.

import { useCallback, useMemo } from "react";
import { useConsentState } from "@/hooks/useConsentState";
import { useActiveRoleView } from "@/hooks/useActiveRoleView";
import { useAlertDismissals } from "@/hooks/useAlertDismissals";
import { ALERT_KEYS, alertSignature } from "@/lib/alertKeys";

const KEY = ALERT_KEYS.PERSONALISED_OFFERS_ASK;
/** Bump only if the ask is ever intentionally re-run as a new campaign. */
const SIGNATURE = alertSignature(KEY, ["v1"]);

export function usePersonalisedOffersAsk() {
  const { rows, isLoading } = useConsentState();
  const view = useActiveRoleView();
  const { loaded, isDismissed, dismiss } = useAlertDismissals();

  const everAnswered = useMemo(
    () => rows.some((r) => r.consent_key === "personalised_offers"),
    [rows],
  );

  const ready = !isLoading && loaded;
  const shouldAsk =
    ready && view === "consumer" && !everAnswered && !isDismissed(KEY, SIGNATURE);

  const markAsked = useCallback(
    () => dismiss([{ key: KEY, signature: SIGNATURE }]),
    [dismiss],
  );

  return { ready, shouldAsk, markAsked };
}
