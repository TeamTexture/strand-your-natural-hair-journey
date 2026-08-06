import { describe, expect, it } from "vitest";
import { buildLexicon, scrubBloodClaims, SUPPRESS_LEXICON } from "@/lib/bloodGuardrail";

const lex = buildLexicon([
  { marker: "lh", display_name: "LH", hair_link_status: "none", hair_link_summary: null },
  { marker: "ferritin", display_name: "Ferritin", hair_link_status: "established", hair_link_summary: "Low ferritin is linked with hair shedding." },
]);

describe("blood guardrail", () => {
  it("drops a causal marker→hair sentence for an uncurated marker", () => {
    const out = scrubBloodClaims(
      "Your LH is low, which is why your hairline is thinning. Keep your wash day gentle.",
      lex,
    );
    expect(out).not.toMatch(/LH/);
    expect(out).toMatch(/wash day/);
  });

  it("keeps a causal sentence for an established marker", () => {
    const out = scrubBloodClaims("Low ferritin can contribute to hair shedding.", lex);
    expect(out).toMatch(/ferritin/i);
  });

  it("suppresses blood/hair sentences before the reference table loads", () => {
    const out = scrubBloodClaims(
      "Your ferritin is low so your hair growth will slow. Rinse with cool water.",
      SUPPRESS_LEXICON,
    );
    expect(out).not.toMatch(/ferritin/i);
    expect(out).toMatch(/cool water/);
  });
});
