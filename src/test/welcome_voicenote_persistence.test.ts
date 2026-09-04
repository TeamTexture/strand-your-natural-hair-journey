import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  hasListenedToWelcome,
  isWelcomeSnoozed,
  markWelcomeListened,
  snoozeWelcome,
} from "@/lib/welcomeVoicenote";

const popup = readFileSync("src/components/WelcomeVoicenotePopup.tsx", "utf8");

describe("welcome voice note — listened state", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("is not listened until playback is recorded", () => {
    expect(hasListenedToWelcome("u1", "m1")).toBe(false);
    markWelcomeListened("u1", "m1");
    expect(hasListenedToWelcome("u1", "m1")).toBe(true);
  });

  it("is scoped per member and per message", () => {
    markWelcomeListened("u1", "m1");
    expect(hasListenedToWelcome("u2", "m1")).toBe(false);
    expect(hasListenedToWelcome("u1", "m2")).toBe(false);
  });

  it("minimise only snoozes for the session", () => {
    expect(isWelcomeSnoozed("u1")).toBe(false);
    snoozeWelcome("u1");
    expect(isWelcomeSnoozed("u1")).toBe(true);
    expect(hasListenedToWelcome("u1", "m1")).toBe(false);
  });
});

describe("welcome popup no longer dismisses itself", () => {
  it("does not write a 'shown' flag while open", () => {
    expect(popup).not.toContain("markShown");
    expect(popup).not.toContain("alreadyShown");
  });

  it("gates visibility on listened, and skips messages already opened", () => {
    expect(popup).toContain("hasListenedToWelcome");
    expect(popup).toContain("onPlay={onListened}");
    // A member who already opened the thread is never re-interrupted.
    expect(popup).toContain('.is("read_at", null)');
  });

});
