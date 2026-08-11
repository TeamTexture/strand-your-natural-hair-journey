import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile, myProfileKey } from "@/hooks/useMyProfile";
import {
  CONFIRM_SECTION_META,
  SESSION_DISMISS_KEY,
  readConfirmedSections,
  type ConfirmSection,
} from "@/lib/profileConfirmation";

/**
 * Whether this member still needs to confirm her own profile answers.
 *
 * True only for members who have finished onboarding but whose
 * `profile_confirmed_at` is null — i.e. everyone who onboarded while some
 * answers were pre-filled for them. Members mid-onboarding are never asked.
 */
export function useProfileConfirmation() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useMyProfile();
  const qc = useQueryClient();
  const [snoozed, setSnoozed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [done, setDone] = useState<ConfirmSection[]>([]);

  useEffect(() => {
    setDone(readConfirmedSections(user?.id));
  }, [user?.id, profile?.profile_confirmed_at]);

  const needsConfirmation =
    !isLoading &&
    !!profile?.onboarding_completed_at &&
    !profile?.profile_confirmed_at;

  const snooze = useCallback(() => {
    try {
      window.sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {
      // Ignore private-browsing storage failures.
    }
    setSnoozed(true);
  }, []);

  const refresh = useCallback(() => {
    setDone(readConfirmedSections(user?.id));
    void qc.invalidateQueries({ queryKey: myProfileKey(user?.id) });
  }, [qc, user?.id]);

  return {
    ready: !isLoading,
    /** Show the AI "provisional" banner. */
    needsConfirmation,
    /** Show the sign-in prompt (not snoozed this session). */
    shouldPrompt: needsConfirmation && !snoozed,
    sections: CONFIRM_SECTION_META.map((s) => ({
      ...s,
      confirmed: done.includes(s.section),
    })),
    snooze,
    refresh,
  };
}
