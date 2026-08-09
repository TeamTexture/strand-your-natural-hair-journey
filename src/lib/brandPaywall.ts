// Brand paywall allowlist.
//
// A brand account with no active (webhook-confirmed) subscription may reach
// ONLY these surfaces: the paywall itself, the billing/checkout path that
// takes payment, the legal documents, support contact and sign out.
// Everything else in the app is closed to them — enforced in the route guard,
// not by hiding UI.
export const BRAND_PAYWALL_PATH = "/brand/subscribe";

const ALLOWED_EXACT = [
  "/",
  BRAND_PAYWALL_PATH,
  "/brand/billing",
  "/brand/checkout/success",
  "/brand/auth",
  "/brand/forgot-password",
  "/brand/reset-password",
  "/reset-password",
  "/forgot-password",
  "/contact",
];

const ALLOWED_PREFIXES = ["/legal/", "/.lovable/"];

/** True when an unpaid brand account is permitted to view this path. */
export function isBrandPaywallAllowedPath(pathname: string) {
  if (ALLOWED_EXACT.includes(pathname)) return true;
  return ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}
