// Tier 3 of the first-run queue: at most one of these prompts, per session,
// and only after the tour and the offers card have had their turn.

import { useEffect, useState } from "react";
import { useFirstRunPromptsBlocked } from "@/hooks/useFirstRunPromptsBlocked";
import { usePersonalisedOffersCard } from "@/hooks/usePersonalisedOffersCard";
import { claimLateSlot, offersCardDone, OFFERS_DONE_EVENT } from "@/lib/firstRunQueue";

/**
 * Returns true only when this prompt may render: the tour is done, the offers
 * card is answered/dismissed (or was never eligible), and no other tier-3
 * prompt has already taken the session's single slot.
 */
export function useLateFirstRunSlot(id: string): boolean {
  const blockedByTour = useFirstRunPromptsBlocked();
  const { eligible: offersEligible } = usePersonalisedOffersCard();
  const [, bump] = useState(0);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener(OFFERS_DONE_EVENT, on);
    return () => window.removeEventListener(OFFERS_DONE_EVENT, on);
  }, []);

  const offersPending = offersEligible && !offersCardDone();
  const ready = !blockedByTour && !offersPending;

  useEffect(() => {
    if (!ready || granted) return;
    if (claimLateSlot(id)) setGranted(true);
  }, [ready, granted, id]);

  return granted;
}
