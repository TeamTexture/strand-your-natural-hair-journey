import { describe, it, expect } from "vitest";
import {
  allChallenges,
  challengeSummary,
  challengesOf,
  proposeChallengesFromTranscript,
} from "@/lib/goalChallenges";

describe("challengesOf", () => {
  it("reads the array and trims blanks", () => {
    expect(challengesOf({ challenges: [" Breakage ", "", "Dryness"] })).toEqual([
      "Breakage",
      "Dryness",
    ]);
  });

  it("falls back to the deprecated singular column only when the array is empty", () => {
    expect(challengesOf({ challenges: [], challenge: "Shedding" })).toEqual(["Shedding"]);
    expect(challengesOf({ challenges: ["Dryness"], challenge: "Shedding" })).toEqual(["Dryness"]);
  });

  it("treats no challenges as a valid empty state", () => {
    expect(challengesOf(null)).toEqual([]);
    expect(challengesOf({ challenge: "   " })).toEqual([]);
  });
});

describe("allChallenges", () => {
  it("flattens across goals and de-duplicates case-insensitively", () => {
    expect(
      allChallenges([
        { challenges: ["Dryness", "Breakage"] },
        { challenges: ["dryness", "Retaining length"] },
        { challenge: "Time" },
      ]),
    ).toEqual(["Dryness", "Breakage", "Retaining length", "Time"]);
  });

  it("has no maximum", () => {
    const many = Array.from({ length: 25 }, (_, i) => `Challenge ${i}`);
    expect(allChallenges([{ challenges: many }])).toHaveLength(25);
  });
});

describe("challengeSummary", () => {
  it("renders one line for cards and PDFs", () => {
    expect(challengeSummary({ challenges: ["Dryness", "Breakage"] })).toBe("Dryness · Breakage");
    expect(challengeSummary({ challenges: [] })).toBe("");
  });
});

describe("proposeChallengesFromTranscript", () => {
  it("splits on spoken connectives and sentence ends", () => {
    expect(
      proposeChallengesFromTranscript(
        "My nape keeps breaking, and my ends feel dry. Also I can't retain length",
      ),
    ).toEqual(["My nape keeps breaking", "My ends feel dry", "I can't retain length"]);
  });

  it("returns nothing for empty or noise-only input", () => {
    expect(proposeChallengesFromTranscript("")).toEqual([]);
    expect(proposeChallengesFromTranscript("  .  ")).toEqual([]);
  });

  it("never duplicates a repeated phrase", () => {
    expect(proposeChallengesFromTranscript("Dryness. dryness")).toEqual(["Dryness"]);
  });
});
