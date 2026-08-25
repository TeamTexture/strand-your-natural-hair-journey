import type { NavigateFunction } from "react-router-dom";
import { pinnedBackTarget, RESUME_PATH } from "@/lib/onboardingLock";

/**
 * Explicit back map for the onboarding flow.
 *
 * Onboarding steps used to fall back to generic history-based back navigation,
 * whose fallback was "/home". For a member who has not paid yet, /home bounces
 * through the paywall gates and the member ends up on a blank/interstitial
 * screen — which read as "the flow skipped me to a blank page".
 *
 * Back inside onboarding is now deterministic: always the previous step.
 */
export const ONBOARDING_PREV: Record<string, string> = {
  "/onboarding/profile-step-1": "/onboarding/goal",
  "/onboarding/profile-step-2": "/onboarding/profile-step-1",
  "/onboarding/profile-supplements": "/onboarding/profile-step-2",
  "/onboarding/profile-step-3-hair": "/onboarding/profile-supplements",
  "/onboarding/profile-step-4-colour": "/onboarding/profile-step-3-hair",
  "/onboarding/blood-timing": "/onboarding/profile-step-4-colour",
  "/blood-upload": "/onboarding/blood-timing",
  "/onboarding/blood-iron-vitamins": "/onboarding/blood-timing",
  "/onboarding/blood-minerals": "/onboarding/blood-iron-vitamins",
  "/onboarding/blood-thyroid": "/onboarding/blood-minerals",
  "/onboarding/blood-hormones": "/onboarding/blood-thyroid",
};

/** First step of the flow — used when we have nowhere sensible to go back to. */
export const ONBOARDING_FIRST_STEP = "/onboarding/goal";

/**
 * Paths deleted with the professional-consultation stage. A saved step or a
 * stored back target pointing at one of these must resolve to the hair
 * characteristics form, never to a dead route.
 */
const RETIRED_PATHS: Record<string, string> = {
  "/onboarding/pro-gate": "/onboarding/profile-step-3-hair",
  "/onboarding/pro-book": "/onboarding/profile-step-3-hair",
  "/onboarding/pro-details": "/onboarding/profile-step-3-hair",
};

/** Resolve any onboarding path, rewriting retired ones. */
export const resolveOnboardingPath = (path: string | null | undefined): string | null => {
  if (!path) return null;
  const bare = path.split("?")[0];
  return RETIRED_PATHS[bare] ?? path;
};

/**
 * The member's last saved onboarding step, with retired pro paths rewritten on
 * READ — members mid-flow must not open the app onto a blank screen.
 */
export const readStoredOnboardingStep = (): string | null => {
  try {
    return resolveOnboardingPath(localStorage.getItem("strand_onboarding_step"));
  } catch {
    return null;
  }
};

export const onboardingPrevPath = (current: string): string =>
  resolveOnboardingPath(ONBOARDING_PREV[resolveOnboardingPath(current) ?? current]) ??
  ONBOARDING_FIRST_STEP;


/** `onBack={onboardingBack(navigate, "/onboarding/profile-step-3-hair")}` */
export const onboardingBack =
  (navigate: NavigateFunction, current: string) => () => {
    const prev = onboardingPrevPath(current);
    // Locked into the resume screen: back may only ever land there.
    const pinned = pinnedBackTarget(current, prev);
    if (pinned === "") return;
    if (pinned) {
      navigate(RESUME_PATH, { replace: true });
      return;
    }
    navigate(prev, { replace: true });
  };
