import { describe, it, expect } from "vitest";
import { CURL_PATTERN_OPTIONS } from "@/components/onboarding/CurlPatternPicker";

/**
 * Hair typing letter/number classification must never appear in this feature —
 * not in labels, descriptions or stored values.
 */
const TYPING_PATTERNS = [
  /\b[1-4][a-cA-C]\b/,            // e.g. a letter+number classification
  /\btype\s*[1-4]\b/i,
  /\b[1-4]\s*[abcABC]\b/,
];

describe("curl pattern options", () => {
  it("offers exactly the four word-only patterns", () => {
    expect(CURL_PATTERN_OPTIONS.map((o) => o.title)).toEqual([
      "Straight",
      "Wavy",
      "Curly",
      "Coily (Afro-textured)",
    ]);
  });

  it("never uses a hair typing letter or number classification", () => {
    for (const opt of CURL_PATTERN_OPTIONS) {
      for (const text of [opt.title, opt.description]) {
        expect(/\d/.test(text)).toBe(false);
        for (const re of TYPING_PATTERNS) expect(re.test(text)).toBe(false);
      }
    }
  });
});
