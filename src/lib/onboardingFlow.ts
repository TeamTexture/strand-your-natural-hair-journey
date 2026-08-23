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
  "/onboarding/profile-step-2": "/onboarding/profile-step-1",
  "/onboarding/profile-supplements": "/onboarding/profile-step-2",
  "/onboarding/pro-gate": "/onboarding/profile-supplements",
  "/onboarding/pro-book": "/onboarding/pro-gate",
  "/onboarding/pro-details": "/onboarding/pro-gate",
  "/onboarding/profile-step-3-hair": "/onboarding/pro-details",
  "/onboarding/profile-step-4-colour": "/onboarding/profile-step-3-hair",
  "/onboarding/blood-timing": "/onboarding/profile-step-4-colour",
  "/blood-upload": "/onboarding/blood-timing",
  "/onboarding/blood-iron-vitamins": "/onboarding/blood-timing",
  "/onboarding/blood-minerals": "/onboarding/blood-iron-vitamins",
  "/onboarding/blood-thyroid": "/onboarding/blood-minerals",
  "/onboarding/blood-hormones": "/onboarding/blood-thyroid",
};

/** First step of the flow — used when we have nowhere sensible to go back to. */
export const ONBOARDING_FIRST_STEP = "/onboarding/profile-step-1";

export const onboardingPrevPath = (current: string): string =>
  ONBOARDING_PREV[current] ?? ONBOARDING_FIRST_STEP;

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
