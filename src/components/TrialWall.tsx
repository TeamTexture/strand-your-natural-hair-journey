import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import LoadingDot from "@/components/LoadingDot";
import { useTrialOffer } from "@/hooks/useTrialOffer";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import {
  ACQUISITION_PATH,
  isPrePaywallPath,
  isTrialWallAllowedPath,
  walledDestination,
  hasAcquisitionBypass,
} from "@/lib/trialWall";
import { TRIAL_PAYWALL_PATH } from "@/lib/trialOffer";

/**
 * The trial paywall wall.
 *
 * Wraps every authenticated consumer surface. A member stamped into the trial
 * funnel who has not started a trial or subscribed cannot reach onboarding, the
 * app, or anything else outside the allowlist — direct URLs, browser back and a
 * stale saved onboarding step all return here.
 *
 * Two pre-paywall steps are exempt while About You is outstanding: her goal and
 * her About You details. The postcode captured there is what makes the guidance
 * work, so it is answered before a card is asked for.
 *
 * Never walls: a live (active/trialing) membership, complimentary access, or an
 * admin/professional role — `getTrialOfferState` returns `walled: false` for
 * each, so they fall straight through to their normal route.
 */
const TrialWall = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const { walled, goalCaptured, known, loading, isError } = useTrialOffer();
  const { data: onboarding, isLoading: onboardingLoading } = useOnboardingStatus();

  // Hold rather than guess: showing the screen first and redirecting after
  // would let a walled member see a flash of the app.
  if (!known && loading) return <LoadingDot />;
  // FAIL-CLOSED: a query error must never let a walled member through to the
  // app. During admin impersonation a transient read failure was silently
  // passing the member past the paywall — hold the loader so the retry can
  // resolve instead of rendering the protected screen.
  if (isError && !known) return <LoadingDot />;
  if (walled && !onboarding?.basicComplete) {
    if (onboardingLoading) return <LoadingDot />;
    if (isPrePaywallPath(location.pathname)) return <>{children}</>;
    // The paywall itself comes AFTER About You — her postcode is what the whole
    // trial is worth. Reaching it early sends her back to finish those two steps.
    if (location.pathname === TRIAL_PAYWALL_PATH) {
      return <Navigate to={walledDestination({ basicComplete: false, goalCaptured })} replace />;
    }
    if (isTrialWallAllowedPath(location.pathname)) return <>{children}</>;

    return (
      <Navigate
        to={walledDestination({ basicComplete: false, goalCaptured })}
        replace
      />
    );
  }
  // About You is done but the one-off attribution question hasn't been asked
  // yet: it sits between About You and the paywall, so the paywall (and
  // everything else) bounces here until it is answered or skipped.
  if (
    walled &&
    onboarding?.basicComplete &&
    onboarding?.acquisitionAnswered === false &&
    !hasAcquisitionBypass()
  ) {
    if (onboardingLoading) return <LoadingDot />;
    if (location.pathname === ACQUISITION_PATH) return <>{children}</>;
    if (isPrePaywallPath(location.pathname)) return <>{children}</>;
    if (isTrialWallAllowedPath(location.pathname) && location.pathname !== TRIAL_PAYWALL_PATH) {
      return <>{children}</>;
    }
    return <Navigate to={ACQUISITION_PATH} replace />;
  }
  if (isTrialWallAllowedPath(location.pathname)) return <>{children}</>;
  if (walled) return <Navigate to={TRIAL_PAYWALL_PATH} replace />;

  return <>{children}</>;
};

export default TrialWall;
