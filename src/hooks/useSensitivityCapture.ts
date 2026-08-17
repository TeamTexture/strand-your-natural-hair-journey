// SENSITIVITY CAPTURE GATE — deliberately NOT useFirstRunNudge.
//
// Allergies are a health and safety input, so this is exempt from the 14-day
// "genuine newness" suppression applied to the tour, goals and hair-length
// nudges: an existing member who has never answered still gets asked. It must
// ask ONCE per surface and never again unless the member opens it themselves.
//
// A null `profiles.*_sensitivities_confirmed_at` is the ONLY state that
// triggers the ask. A set timestamp with zero entries means the member
// deliberately said they have none.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useMyProfile";
import { useConsumerSubscription } from "@/hooks/useConsumerSubscription";
import { useSensitivities } from "@/hooks/useSensitivities";
import type { SensitivityScope } from "@/lib/sensitivityVocab";

/** Per-session guard so a remount inside one visit cannot re-open the ask. */
const askedThisSession = new Set<string>();

export function useSensitivityCapture(scope: SensitivityScope) {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const { hasAccess, isLoading: accessLoading } = useConsumerSubscription();
  const { confirmedAt, loading: sensLoading } = useSensitivities();
  const [open, setOpen] = useState(false);

  const onboarded = !!profile?.onboarding_completed_at;
  const neverAsked = confirmedAt(scope) === null;
  const sessionKey = `${user?.id ?? "anon"}:${scope}`;

  const shouldAsk =
    !profileLoading &&
    !accessLoading &&
    !sensLoading &&
    !!user?.id &&
    onboarded &&
    hasAccess &&
    neverAsked &&
    !askedThisSession.has(sessionKey);

  useEffect(() => {
    if (!shouldAsk) return;
    askedThisSession.add(sessionKey);
    setOpen(true);
  }, [shouldAsk, sessionKey]);

  /** Manual entry point from the persistent "avoiding" summary or Profile. */
  const openEditor = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  return {
    /** True while the capture card / sheet should be shown. */
    open,
    openEditor,
    close,
    /** Never answered — used to word the summary honestly. */
    neverAnswered: neverAsked,
    loading: profileLoading || accessLoading || sensLoading,
  };
}
