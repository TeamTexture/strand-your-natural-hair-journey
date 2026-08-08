// Eligibility for the ONE-TIME personalised-offers ask shown straight after the
// hair profile is completed.
//
// Rules (deliberate, do not loosen):
//  • Ask only if `personalised_offers` has NEVER been granted (ledger history).
//  • Ask once. The decline/dismiss is written to `alert_dismissals`, so it
//    survives reload and navigation — component state was the old bug.
//  • The ask never gates anything; declining changes nothing about access.

import { useCallback, useMemo } from "react";
import { useConsentState } from "@/hooks/useConsentState";
import { useAlertDismissals } from "@/hooks/useAlertDismissals";
import { ALERT_KEYS, alertSignature } from "@/lib/alertKeys";

const KEY = ALERT_KEYS.PERSONALISED_OFFERS_ASK;
/** Bump only if the ask is ever intentionally re-run as a new campaign. */
const SIGNATURE = alertSignature(KEY, ["v1"]);

export function usePersonalisedOffersAsk() {
  const { rows, isLoading } = useConsentState();
  const { loaded, isDismissed, dismiss } = useAlertDismissals();

  const everGranted = useMemo(
    () => rows.some((r) => r.consent_key === "personalised_offers" && r.granted),
    [rows],
  );

  const ready = !isLoading && loaded;
  const shouldAsk = ready && !everGranted && !isDismissed(KEY, SIGNATURE);

  const markAsked = useCallback(
    () => dismiss([{ key: KEY, signature: SIGNATURE }]),
    [dismiss],
  );

  return { ready, shouldAsk, markAsked };
}
