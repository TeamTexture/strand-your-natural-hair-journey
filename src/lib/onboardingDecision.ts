import {
  getSubscribePath,
  POST_PAYMENT_ANALYSIS_PATH,
} from "@/lib/consumerOnboarding";

export interface OnboardingCompletionStatus {
  dataComplete: boolean;
  healthComplete: boolean;
  hairComplete: boolean;
  styleComplete: boolean;
  bloodOnFile: boolean;
  consultationComplete: boolean;
  entryPath: string;
}

export interface OnboardingRequirements {
  hairComplete: boolean;
  bloodComplete: boolean;
  consultationComplete: boolean;
  dataComplete: boolean;
  hairOutstanding: boolean;
  bloodOutstanding: boolean;
  consultationOutstanding: boolean;
}

/**
 * The authoritative interpretation of onboarding completion.
 *
 * Hair characteristics are only complete once both the clinical markers and
 * colour/style step are saved. No screen should infer these requirements from
 * a draft, route, local lock, or one table in isolation.
 */
export function getOnboardingRequirements(
  status: OnboardingCompletionStatus,
): OnboardingRequirements {
  const hairComplete = status.hairComplete && status.styleComplete;
  const bloodComplete = status.bloodOnFile;
  const consultationComplete = status.consultationComplete;

  return {
    hairComplete,
    bloodComplete,
    consultationComplete,
    dataComplete: status.dataComplete,
    hairOutstanding: !hairComplete,
    bloodOutstanding: !bloodComplete,
    consultationOutstanding: !consultationComplete,
  };
}

/** One answer for where a member belongs after any onboarding save/read. */
export function getOnboardingNextPath(
  status: OnboardingCompletionStatus,
  hasAccess: boolean,
): string {
  if (status.dataComplete) {
    return hasAccess ? POST_PAYMENT_ANALYSIS_PATH : getSubscribePath();
  }
  return status.healthComplete ? "/onboarding/resume" : status.entryPath;
}
