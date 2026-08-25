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
      // The resume screen is only the answer when BOTH required pieces are
      // outstanding — a genuine choice. Exactly one left routes straight to it.
      const expected =
        hair && consultation
          ? "/subscribe?next=%2Fonboarding%2Fblood-ai-summary"
          : !hair && !consultation
            ? "/onboarding/resume"
            : consultation
              ? "/onboarding/profile-step-3-hair"
              : "/onboarding/pro-gate";
      expect(getOnboardingNextPath(status, false)).toBe(expected);
    },
  );

  it("routes a member with only hair outstanding into the markers form", () => {
    const status = statusFor(false, false, true);
    expect(getOnboardingNextPath(status, false)).toBe("/onboarding/profile-step-3-hair");
  });

  it("resumes the colour step when markers are saved but style is not", () => {
    const status = {
      ...statusFor(true, false, true),
      styleComplete: false,
      dataComplete: false,
    };
    expect(getOnboardingNextPath(status, false)).toBe("/onboarding/profile-step-4-colour");
  });

  it("routes a member with only the consultation outstanding into the pro flow", () => {
    const status = statusFor(true, false, false);
    expect(getOnboardingNextPath(status, false)).toBe("/onboarding/pro-gate");
  });

  it("keeps the resume screen for a genuine choice between two outstanding pieces", () => {
    const status = statusFor(false, false, false);
    expect(getOnboardingNextPath(status, false)).toBe("/onboarding/resume");
  });

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