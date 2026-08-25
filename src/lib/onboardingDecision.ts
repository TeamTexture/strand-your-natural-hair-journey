import {
  getSubscribePath,
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
  /** Hair + consultation only — the two things that gate Subscribe/app access. */
  coreComplete: boolean;
  dataComplete: boolean;
  hairOutstanding: boolean;
  bloodOutstanding: boolean;
  consultationOutstanding: boolean;
}

/**
 * The authoritative interpretation of onboarding completion.
 *
 * Hair characteristics are only complete once both the clinical markers and
 * colour/style step are saved. A logged professional consultation is required
 * alongside them. Blood work is optional — `bloodComplete` is reported here so
 * the diet and nutrition surfaces can read it, but it never counts towards
 * coreComplete. No screen should infer these from a draft, route or local lock.
 */
export function getOnboardingRequirements(
  status: OnboardingCompletionStatus,
): OnboardingRequirements {
  const hairComplete = status.hairComplete && status.styleComplete;
  const bloodComplete = status.bloodOnFile;
  const consultationComplete = status.consultationComplete;
  const coreComplete = hairComplete && consultationComplete;

  return {
    hairComplete,
    bloodComplete,
    consultationComplete,
    coreComplete,
    dataComplete: status.dataComplete || coreComplete,
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
  const { coreComplete } = getOnboardingRequirements(status);
  if (status.dataComplete || coreComplete) {
    return hasAccess ? "/home" : getSubscribePath();
  }
  return status.healthComplete ? "/onboarding/resume" : status.entryPath;
}
