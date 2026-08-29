// "Works With Your Hair" must reason about her record, never rephrase
// "What It's Doing Here". Pins the exact reported Decyl Glucoside line.
import { describe, it, expect } from "vitest";
import {
  duplicatesFactualCopy,
  deterministicProfileFit,
  memberDataTokens,
  referencesMemberData,
} from "../../supabase/functions/_shared/fit-personalisation.ts";

const TOKENS = memberDataTokens({
  hair: { porosity: "high", density: "medium", curl_pattern: "tight coils", scalp_condition: "dry scalp" },
  goals: [{ title: "Length retention", challenges: ["breakage at the ends"] }],
  sensitivities: [{ name: "Sulphates" }],
});

describe("deterministic glossary fit fallback", () => {
  it("grounds an active in the real profile without inventing a follicle effect", () => {
    const fit = deterministicProfileFit({
      hair: { porosity: "high" },
      goals: [{ title: "Length retention" }],
      ingredientCategory: "Active",
    });
    expect(fit).toContain("high porosity");
    expect(fit).toContain("does not establish a follicle or growth effect");
    expect(fit).toContain("length retention");
  });
});

const REPORTED =
  "A gentle, plant-based surfactant that cleanses the scalp and hair without stripping away essential surface lipids";

describe("fit personalisation detector", () => {
  it("rejects the reported generic Decyl Glucoside line as a rephrase of the factual copy", () => {
    const factual =
      "A gentle plant-derived surfactant used to cleanse hair and scalp without stripping surface lipids.";
    expect(duplicatesFactualCopy(REPORTED, factual)).toBe(true);
  });

  it("accepts a line that names her own stored trait", () => {
    const good =
      "Because your porosity is high, water leaves as fast as it enters, so a mild cleanser like this keeps your dry scalp comfortable while you chase length retention.";
    expect(referencesMemberData(good, TOKENS)).toBe(true);
    expect(duplicatesFactualCopy(good, REPORTED)).toBe(false);
  });

  it("does not treat an ingredient-only sentence as personalised", () => {
    expect(referencesMemberData("A mild plant-derived cleanser used in shampoos.", TOKENS)).toBe(false);
  });

  it("rejects the reported line outright — mentioning scalp/hair is not personalisation", () => {
    expect(referencesMemberData(REPORTED, TOKENS)).toBe(false);
  });

  it("builds tokens from her values, not column names", () => {
    expect(TOKENS).toContain("coils");
    expect(TOKENS).toContain("sulphates");
    expect(TOKENS).not.toContain("curl_pattern");
  });
});
