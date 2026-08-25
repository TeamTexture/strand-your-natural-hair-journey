import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import LoadingDot from "@/components/LoadingDot";
import { useTrialOffer } from "@/hooks/useTrialOffer";
import { isTrialWallAllowedPath } from "@/lib/trialWall";
import { TRIAL_PAYWALL_PATH } from "@/lib/trialOffer";

/**
 * The trial paywall wall.
 *
 * Wraps every authenticated consumer surface. A member stamped into the trial
 * funnel who has not started a trial or subscribed cannot reach onboarding, the
 * app, or anything else outside the allowlist — direct URLs, browser back and a
 * stale saved onboarding step all return here.
 *
 * Never walls: a live (active/trialing) membership, complimentary access, or an
 * admin/professional role — `getTrialOfferState` returns `walled: false` for
 * each, so they fall straight through to their normal route.
 */
const TrialWall = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const { walled, known, loading } = useTrialOffer();

  if (isTrialWallAllowedPath(location.pathname)) return <>{children}</>;
  // Hold rather than guess: showing the screen first and redirecting after
  // would let a walled member see a flash of the app.
  if (!known && loading) return <LoadingDot />;
  if (walled) return <Navigate to={TRIAL_PAYWALL_PATH} replace />;
  return <>{children}</>;
};

export default TrialWall;
