import { describe, expect, it } from "vitest";
import { splitParagraphs, perParagraph, hasParagraphs } from "@/lib/paragraphs";
import { renderInlineWithProducts } from "@/lib/smartInline";
import { IngredientToken } from "@/components/ingredients/IngredientToken";
import type { ReactElement } from "react";

describe("paragraph shape", () => {
  const prose = "Amodimethicone coats the cuticle.\n\nWith your low porosity that means less can get in.";

  it("splits AI prose on blank lines", () => {
    expect(splitParagraphs(prose)).toHaveLength(2);
    expect(hasParagraphs(prose)).toBe(true);
  });

  it("preserves the break when a transformer runs over each paragraph", () => {
    const out = perParagraph(prose, (p) => p.replace(/\s{2,}/g, " ").trim());
    expect(out.split("\n\n")).toHaveLength(2);
  });

  it("drops empty blocks rather than emitting stacked blank lines", () => {
    expect(splitParagraphs("one\n\n\n\ntwo\n\n  \n\nthree")).toEqual(["one", "two", "three"]);
  });
});

describe("first-occurrence tokenisation", () => {
  it("tokenises a glossary term once per block, however often it repeats", () => {
    const nodes = renderInlineWithProducts(
      "Glycerin draws in water. Glycerin is a humectant, and glycerin behaves differently in dry air.",
      "t",
      [],
      ["Glycerin"],
    );
    const tokens = nodes.filter(
      (n) => (n as ReactElement)?.type === IngredientToken,
    );
    expect(tokens).toHaveLength(1);
  });
});
