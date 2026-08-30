import { describe, expect, it } from "vitest";
import {
  applyConcernFit,
  concernMechanism,
  parseConcerns,
} from "../../supabase/functions/_shared/concern-fit";
import { minusIsScoreWorthy } from "../../supabase/functions/_shared/fit-first-score";

describe("areas of concern are a first-class scoring input", () => {
  it("reads the recorded areas", () => {
    expect(parseConcerns(["edges_hairline", "crown"])).toEqual(["edges", "hairline", "crown"]);
    expect(parseConcerns(null)).toEqual([]);
  });

  it("treats root/shedding/density mechanisms as serving edges and hairline", () => {
    expect(concernMechanism("supports root anchorage", ["edges"])).toBe("root anchoring");
    expect(concernMechanism("reduces shedding", ["hairline"])).toBe("shedding");
    expect(concernMechanism("adds slip and softness", ["hairline"])).toBeNull();
    // No recorded concern → no correction at all.
    expect(concernMechanism("supports root anchorage", [])).toBeNull();
  });

  it("never overrides a declared sensitivity", () => {
    expect(
      concernMechanism("root anchoring peptide, but matches your declared sensitivity", ["edges"]),
    ).toBeNull();
  });

  it("K18 regression: a root/shedding minus becomes a plus and lifts the score", () => {
    const out = applyConcernFit({
      score: 52,
      reasons: [
        {
          direction: "minus",
          factor: "Formula targets ageing, greying, shedding",
          reason:
            "Palmitoyl dipeptide-52 works on root anchorage — not the breakage and length retention challenge.",
        },
      ],
      cards: [
        { name: "Palmitoyl dipeptide-52", benefit: "supports root anchorage", flag: "warn" },
      ],
      concerns: ["edges", "hairline"],
    });
    expect(out.reasons[0].direction).toBe("plus");
    expect(out.reasons[0].reason).toMatch(/root anchoring/);
    expect(out.score).toBe(80);
    expect((out.cards as Array<{ flag: string }>)[0].flag).toBe("good");
  });

  it("relevance framing without the word 'rather' is still not score-worthy", () => {
    expect(
      minusIsScoreWorthy({
        direction: "minus",
        factor: "Formula targets ageing and shedding",
        reason: "It targets pigmentation signals — not the breakage challenge you recorded.",
      }),
    ).toBe(false);
  });
});
