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
  /** Hair characteristics only — the one thing that gates Subscribe/app access. */
  coreComplete: boolean;
  dataComplete: boolean;
  hairOutstanding: boolean;
  bloodOutstanding: boolean;
  consultationOutstanding: boolean;
}

/**
 * The authoritative interpretation of onboarding completion.
 *
 * Hair characteristics are only complete once both the markers and the
 * colour/style step are saved — and they are the only requirement. Blood work
 * and the professional consultation are optional: both are reported here (the
 * diet and nutrition surfaces read `bloodComplete`) but neither counts towards
 * coreComplete. No screen should infer these from a draft, route or local lock.
 */
export function getOnboardingRequirements(
  status: OnboardingCompletionStatus,
): OnboardingRequirements {
  const hairComplete = status.hairComplete && status.styleComplete;
  const bloodComplete = status.bloodOnFile;
  const consultationComplete = status.consultationComplete;
  const coreComplete = hairComplete;

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

/**
 * The screen for the single outstanding required piece — the hair
 * characteristics — or null when nothing required is left.
 */
function singleOutstandingPath(status: OnboardingCompletionStatus): string | null {
  const { hairOutstanding } = getOnboardingRequirements(status);
  if (!hairOutstanding) return null;
  // Markers saved but colour/style still missing → resume that form, not step 3.
  return status.hairComplete
    ? "/onboarding/profile-step-4-colour"
    : "/onboarding/profile-step-3-hair";
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
  if (!status.healthComplete) return status.entryPath;
  return singleOutstandingPath(status) ?? "/onboarding/resume";
}
