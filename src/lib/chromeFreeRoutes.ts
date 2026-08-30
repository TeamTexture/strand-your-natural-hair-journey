// Single source of truth for "no authenticated app chrome here".
//
// Pre-paywall and onboarding screens carry ONLY their own title bar and
// content: no navigation, no notifications bell, no chat widget, no admin
// controls. An admin account walking the consumer funnel must see exactly what
// a member sees — an admin notification bell on /onboarding/acquisition leaked
// approval-queue titles (which can contain other people's names) onto a
// registration screen.
//
// Both GlobalMenu (top bar, chat widget, view switcher, tips control) and
// TitleBar (notifications bell) read this list, so the two cannot drift.
export const CHROME_FREE_PREFIXES = [
  "/onboarding",
  "/walkthrough",
  "/setup",
  "/blood-upload",
  "/subscribe",
  "/start-trial",
  "/auth",
  "/forgot-password",
  "/reset-password",
  "/pro/auth",
  "/pro/forgot-password",
  "/pro/reset-password",
  "/brand/auth",
  "/brand/forgot-password",
  "/brand/reset-password",
  "/brand/subscribe",
  "/international",
  "/.lovable",
];

/** True on any onboarding / trial-registration / pre-paywall route. */
export const isChromeFreeRoute = (pathname: string): boolean =>
  pathname === "/" || CHROME_FREE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(p));
