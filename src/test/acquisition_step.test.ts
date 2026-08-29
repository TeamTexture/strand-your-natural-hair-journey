import { describe, expect, it } from "vitest";
import { ACQUISITION_PATH, PRE_PAYWALL_PATHS, walledDestination } from "@/lib/trialWall";
import { TRIAL_PAYWALL_PATH } from "@/lib/trialOffer";
import { ONBOARDING_PREV } from "@/lib/onboardingFlow";

/**
 * The "How did you find STRAND?" screen sits between About You and the trial
 * paywall: asked exactly once, skippable, and never a gate of its own.
 */
describe("acquisition step placement", () => {
  it("routes a walled member with About You done but no answer to the question", () => {
    expect(
      walledDestination({ basicComplete: true, goalCaptured: true, acquisitionAnswered: false }),
    ).toBe(ACQUISITION_PATH);
  });

  it("routes straight to the paywall once answered or skipped", () => {
    expect(
      walledDestination({ basicComplete: true, goalCaptured: true, acquisitionAnswered: true }),
    ).toBe(TRIAL_PAYWALL_PATH);
  });

  it("keeps legacy callers (no acquisition signal) on the paywall path", () => {
    expect(walledDestination({ basicComplete: true, goalCaptured: true })).toBe(TRIAL_PAYWALL_PATH);
  });

  it("never jumps the queue before About You is complete", () => {
    expect(
      walledDestination({ basicComplete: false, goalCaptured: true, acquisitionAnswered: false }),
    ).toBe("/onboarding/profile-step-1");
    expect(
      walledDestination({ basicComplete: false, goalCaptured: false, acquisitionAnswered: false }),
    ).toBe("/onboarding/goal");
  });

  it("is reachable before the paywall and steps back to About You", () => {
    expect(PRE_PAYWALL_PATHS).toContain(ACQUISITION_PATH);
    expect(ONBOARDING_PREV[ACQUISITION_PATH]).toBe("/onboarding/profile-step-1");
  });
});
