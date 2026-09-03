/**
 * THE destination rule for the `/open` email landing route.
 *
 * Pure and additive: it never re-implements the paywall or onboarding logic, it
 * only orders the answers those existing helpers already give
 * (`getTrialOfferState`, `walledDestination`, `getConsumerOnboardingStatus`).
 * Nothing in SplashScreen / Index / TrialWall / PaidGate is touched.
 */
import { TRIAL_PAYWALL_PATH } from "@/lib/trialOffer";

export interface OpenMessageState {
  /** A readable Supabase session exists. */
  signedIn: boolean;
  /** Thread id from the email link, when present and well formed. */
  threadId: string | null;
  /** True while the account is behind the trial/card wall. */
  walled: boolean;
  /** Where a walled account belongs (from walledDestination()). */
  walledPath?: string | null;
  /** Consumer onboarding finished. */
  onboardingComplete: boolean;
  /** Resume entry path for an unfinished onboarding (from the status helper). */
  onboardingPath?: string | null;
  /** Staff accounts go straight to the thread — they have no consumer funnel. */
  isStaff?: boolean;
}

export interface OpenMessageDecision {
  path: string;
  /** Remember the thread so a later hop can still land in the chat. */
  remember: boolean;
  reason:
    | "signed_out"
    | "staff"
    | "walled"
    | "onboarding"
    | "thread"
    | "inbox";
}

export function openMessageDestination(state: OpenMessageState): OpenMessageDecision {
  const thread = state.threadId ? `/messages/${state.threadId}` : "/messages";

  // 1. No session. Registration/sign-in is the entry point; the intent is kept
  //    so the chat is still where she ends up once she is through.
  if (!state.signedIn) {
    const next = state.threadId ? `/open?t=${state.threadId}` : "/open";
    return {
      path: `/?next=${encodeURIComponent(next)}`,
      remember: true,
      reason: "signed_out",
    };
  }

  // 2. Admin / professional / brand accounts have no consumer paywall.
  if (state.isStaff) {
    return { path: thread, remember: false, reason: "staff" };
  }

  // 3. Never paid / never started the trial → the trial funnel.
  if (state.walled) {
    return {
      path: state.walledPath || TRIAL_PAYWALL_PATH,
      remember: true,
      reason: "walled",
    };
  }

  // 4. Registered and entitled but onboarding unfinished → resume it. The tour
  //    completion handler consumes the remembered thread afterwards.
  if (!state.onboardingComplete && state.onboardingPath) {
    return { path: state.onboardingPath, remember: true, reason: "onboarding" };
  }

  // 5. Straight into the chat.
  return {
    path: thread,
    remember: false,
    reason: state.threadId ? "thread" : "inbox",
  };
}
