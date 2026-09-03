import { describe, expect, it, beforeEach } from "vitest";
import { openMessageDestination } from "@/lib/openMessageDestination";
import {
  consumePendingMessageThread,
  peekPendingMessageThread,
  PENDING_MESSAGE_KEY,
  PENDING_MESSAGE_MAX_AGE_MS,
  setPendingMessageThread,
} from "@/lib/pendingMessageLink";

const THREAD = "11111111-2222-4333-8444-555555555555";

describe("openMessageDestination", () => {
  it("sends a signed-out recipient to sign-in and remembers the thread", () => {
    const d = openMessageDestination({
      signedIn: false,
      threadId: THREAD,
      walled: false,
      onboardingComplete: false,
    });
    expect(d.reason).toBe("signed_out");
    expect(d.remember).toBe(true);
    expect(d.path).toContain("%2Fopen%3Ft%3D");
  });

  it("sends a walled account to the trial funnel", () => {
    const d = openMessageDestination({
      signedIn: true,
      threadId: THREAD,
      walled: true,
      walledPath: "/start-trial",
      onboardingComplete: false,
    });
    expect(d.path).toBe("/start-trial");
    expect(d.remember).toBe(true);
  });

  it("resumes unfinished onboarding", () => {
    const d = openMessageDestination({
      signedIn: true,
      threadId: THREAD,
      walled: false,
      onboardingComplete: false,
      onboardingPath: "/onboarding/hair",
    });
    expect(d.path).toBe("/onboarding/hair");
    expect(d.remember).toBe(true);
  });

  it("takes an entitled, onboarded member straight to the chat", () => {
    const d = openMessageDestination({
      signedIn: true,
      threadId: THREAD,
      walled: false,
      onboardingComplete: true,
    });
    expect(d.path).toBe(`/messages/${THREAD}`);
    expect(d.remember).toBe(false);
  });

  it("never applies the consumer paywall to staff", () => {
    const d = openMessageDestination({
      signedIn: true,
      threadId: THREAD,
      isStaff: true,
      walled: true,
      walledPath: "/start-trial",
      onboardingComplete: false,
    });
    expect(d.path).toBe(`/messages/${THREAD}`);
  });
});

describe("pending message link", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips and clears on consume", () => {
    setPendingMessageThread(THREAD);
    expect(peekPendingMessageThread()).toBe(THREAD);
    expect(consumePendingMessageThread()).toBe(THREAD);
    expect(peekPendingMessageThread()).toBeNull();
  });

  it("ignores non-uuid input", () => {
    setPendingMessageThread("not-a-thread");
    expect(peekPendingMessageThread()).toBeNull();
  });

  it("expires after the window", () => {
    setPendingMessageThread(THREAD);
    expect(peekPendingMessageThread(Date.now() + PENDING_MESSAGE_MAX_AGE_MS + 1)).toBeNull();
    expect(localStorage.getItem(PENDING_MESSAGE_KEY)).toBeNull();
  });
});
