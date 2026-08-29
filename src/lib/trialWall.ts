import { TRIAL_PAYWALL_PATH } from "@/lib/trialOffer";

/** Step 1 — the hair goal and challenges. Captured before the paywall. */
export const TRIAL_GOAL_PATH = "/onboarding/goal";
/** Step 2 — About You (photo, name, mobile, age, postcode, country, heritage). */
export const TRIAL_REGISTRATION_PATH = "/onboarding/profile-step-1";
/** Optional attribution question — sits between About You and the paywall. */
export const ACQUISITION_PATH = "/onboarding/acquisition";

/**
 * The steps a stamped member may complete BEFORE the paywall.
 *
 * About You captures her postcode, which drives water hardness and everything
 * personalised on top of it — so it has to be answered before we take a card.
 * The acquisition question is optional but is asked once, after About You and
 * before the paywall. Step 3 onward (health, supplements, hair
 * characteristics, colour & style, blood work) needs a trialing or active
 * membership.
 */
export const PRE_PAYWALL_PATHS = [TRIAL_GOAL_PATH, TRIAL_REGISTRATION_PATH, ACQUISITION_PATH];

export const isPrePaywallPath = (pathname: string) => PRE_PAYWALL_PATHS.includes(pathname);

// Trial paywall allowlist.
//
// A stamped account with no live membership may reach ONLY these surfaces plus
// the two pre-paywall steps until About You is complete. Everything after that
// bounces back to the paywall. This is enforced in the route guards, not by
// hiding links, so a typed URL, stale localStorage step and the browser back
// button all land in the same place.
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

/**
 * THE single destination rule for a walled account.
 *
 * - About You still outstanding → the pre-paywall step she is on (goal first,
 *   then About You). No card is asked for before we know where she lives.
 * - About You answered → the paywall, wherever she was heading.
 *
 * Every resolver (sign-in, splash, welcome screen, the About You form itself)
 * calls this, so there is exactly one place that decides.
 */
export function walledDestination(opts: {
  basicComplete: boolean;
  goalCaptured: boolean;
  /**
   * Whether the attribution question has been answered or skipped. Omitted by
   * legacy callers — treated as answered so they keep their old behaviour.
   */
  acquisitionAnswered?: boolean;
}): string {
  if (opts.basicComplete) {
    return opts.acquisitionAnswered === false ? ACQUISITION_PATH : TRIAL_PAYWALL_PATH;
  }
  return opts.goalCaptured ? TRIAL_REGISTRATION_PATH : TRIAL_GOAL_PATH;
}
