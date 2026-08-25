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
  dataComplete: hair && consultation,
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
      expect(requirements.consultationOutstanding).toBe(!consultation);
      expect(requirements.coreComplete).toBe(hair && consultation);
      expect(getOnboardingNextPath(status, false)).toBe(
        hair && consultation
          ? "/subscribe?next=%2Fonboarding%2Fblood-ai-summary"
          : "/onboarding/resume",
      );
    },
  );

  it("sends a fully complete paid member home", () => {
    expect(getOnboardingNextPath(statusFor(true, true, true), true)).toBe(
      "/home",
    );
  });

  it("never lets outstanding blood work gate subscribe", () => {
    const status = statusFor(true, false, true);
    expect(getOnboardingRequirements(status).coreComplete).toBe(true);
    expect(getOnboardingNextPath(status, false)).toBe(
      "/subscribe?next=%2Fonboarding%2Fblood-ai-summary",
    );
  });

  it("does not call hair complete until both hair and style are saved", () => {
    const status = { ...statusFor(true, true, true), styleComplete: false, dataComplete: false };
    expect(getOnboardingRequirements(status).hairOutstanding).toBe(true);
  });
});