// Sequencing for competing first-run prompts.
//
// The guided home tour always goes first. Any other first-run ask (today: the
// personalised-offers card) stays hidden until the tour has been completed or
// skipped, so two prompts never share the screen.

import { useEffect, useState } from "react";
import { useFirstRunNudge } from "@/hooks/useFirstRunNudge";
import {
  isTourActive,
  isTourStarted,
  tourFinished,
  TOUR_ACTIVE_EVENT,
  TOUR_DONE_EVENT,
} from "@/lib/firstRunTour";

export function useFirstRunPromptsBlocked(): boolean {
  const { eligible: tourPending } = useFirstRunNudge("home_tour_seen_at");
  const [, bump] = useState(0);

  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    window.addEventListener(TOUR_ACTIVE_EVENT, onChange as EventListener);
    window.addEventListener(TOUR_DONE_EVENT, onChange as EventListener);
    return () => {
      window.removeEventListener(TOUR_ACTIVE_EVENT, onChange as EventListener);
      window.removeEventListener(TOUR_DONE_EVENT, onChange as EventListener);
    };
  }, []);

  // Blocked while the tour is on screen, while it is still waiting to run for
  // this member, and while it has been opened but not yet finished (minimised).
  return isTourActive() || tourPending || (isTourStarted() && !tourFinished());
}
