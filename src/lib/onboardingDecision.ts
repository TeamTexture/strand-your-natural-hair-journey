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

/**
 * The screen for the single outstanding required piece, or null when there is a
 * genuine choice (two things outstanding) and the resume screen is the answer.
 *
 * The consultation and the hair characteristics are one sequence, not two jobs:
 * the consultation produces the markers. So when only one of them is left there
 * is nothing to choose between — send her straight into it rather than parking
 * her on a splash screen she then has to navigate herself.
 */
function singleOutstandingPath(status: OnboardingCompletionStatus): string | null {
  const { hairOutstanding, consultationOutstanding } = getOnboardingRequirements(status);
  const outstandingCount = Number(hairOutstanding) + Number(consultationOutstanding);
  if (outstandingCount !== 1) return null;
  if (consultationOutstanding) return "/onboarding/pro-gate";
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
