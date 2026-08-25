import { describe, expect, it } from "vitest";
import {
  getOnboardingNextPath,
  getOnboardingRequirements,
  type OnboardingCompletionStatus,
} from "@/lib/onboardingDecision";

const statusFor = (
  hair: boolean,
  blood: boolean,
  consultation: boolean,
): OnboardingCompletionStatus => ({
  healthComplete: true,
  hairComplete: hair,
  styleComplete: hair,
  bloodOnFile: blood,
  consultationComplete: consultation,
  dataComplete: hair,
  entryPath: "/onboarding/resume",
});

describe("onboarding completion matrix", () => {
  const combinations = [
    [false, false, false],
    [false, false, true],
    [false, true, false],
    [false, true, true],
    [true, false, false],
    [true, false, true],
    [true, true, false],
    [true, true, true],
  ] as const;

  it.each(combinations)(
    "hair=%s blood=%s consultation=%s has one consistent destination",
    (hair, blood, consultation) => {
      const status = statusFor(hair, blood, consultation);
      const requirements = getOnboardingRequirements(status);

      expect(requirements.hairOutstanding).toBe(!hair);
      expect(requirements.bloodOutstanding).toBe(!blood);
      // Neither blood work nor the consultation gates access any more.
      expect(requirements.coreComplete).toBe(hair);
      // Post-payment destination follows bloodOnFile: the analysis screen only
      // when there is something to analyse, otherwise straight into the app.
      const expected = hair
        ? blood
          ? "/subscribe?next=%2Fonboarding%2Fblood-ai-summary"
          : "/subscribe?next=%2Fhome"
        : "/onboarding/profile-step-3-hair";
      expect(getOnboardingNextPath(status, false)).toBe(expected);
    },
  );

  it("routes a member with hair outstanding into the markers form", () => {
    expect(getOnboardingNextPath(statusFor(false, false, false), false)).toBe(
      "/onboarding/profile-step-3-hair",
    );
  });

  it("resumes the colour step when markers are saved but style is not", () => {
    const status = {
      ...statusFor(true, false, true),
      styleComplete: false,
      dataComplete: false,
    };
    expect(getOnboardingNextPath(status, false)).toBe("/onboarding/profile-step-4-colour");
  });

  it("never lets a missing consultation gate subscribe", () => {
    const status = statusFor(true, false, false);
    expect(getOnboardingRequirements(status).coreComplete).toBe(true);
    expect(getOnboardingNextPath(status, false)).toBe("/subscribe?next=%2Fhome");
  });

  it("never lets outstanding blood work gate subscribe", () => {
    const status = statusFor(true, false, true);
    expect(getOnboardingRequirements(status).coreComplete).toBe(true);
    expect(getOnboardingNextPath(status, false)).toBe("/subscribe?next=%2Fhome");
  });

  it("sends a fully complete paid member home", () => {
    expect(getOnboardingNextPath(statusFor(true, true, true), true)).toBe("/home");
  });

  it("does not call hair complete until both hair and style are saved", () => {
    const status = { ...statusFor(true, true, true), styleComplete: false, dataComplete: false };
    expect(getOnboardingRequirements(status).hairOutstanding).toBe(true);
  });
});
