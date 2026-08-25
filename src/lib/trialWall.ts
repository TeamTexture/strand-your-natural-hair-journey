import { TRIAL_PAYWALL_PATH } from "@/lib/trialOffer";

export const TRIAL_REGISTRATION_PATH = "/onboarding/profile-step-1";

// Trial paywall allowlist.
//
// A stamped account with no live membership may reach ONLY these surfaces plus
// the registration-details step until it is complete. Everything after name,
// address and basic details bounces back to the paywall. This is enforced in the
// route guards, not by hiding links, so a typed URL, stale localStorage step and
// the browser back button all land in the same place.
const ALLOWED_EXACT = [
  "/",
  TRIAL_PAYWALL_PATH,
  "/subscribe",
  "/auth",
  "/contact",
  "/help",
  "/forgot-password",
  "/reset-password",
  "/plus/welcome",
];

const ALLOWED_PREFIXES = ["/legal/", "/.lovable/"];

/** True when a walled account is permitted to view this path. */
export function isTrialWallAllowedPath(pathname: string) {
  if (ALLOWED_EXACT.includes(pathname)) return true;
  return ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}
