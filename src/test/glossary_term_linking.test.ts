import { describe, it, expect } from "vitest";
import { glossarySegments } from "@/lib/glossarySpans";

// Standing standard (CLAUDE.md): every technical term in generated copy is bold
// AND tappable. These cases are the exact ways it silently degraded to
// bold-but-dead text: an embedded family word, and a hyphenated concept.
const VOCAB = ["high porosity", "surfactant", "cuticle", "sebum"];
const lookup = (name: string) => {
  const key = name.toLowerCase();
  const rows: Record<string, string> = {
    "high porosity": "high porosity",
    surfactant: "Surfactants",
    cuticle: "Cuticle",
    sebum: "Sebum",
  };
  return rows[key] ? { display_name: rows[key] } : null;
};

const linked = (text: string) =>
  glossarySegments(text, VOCAB, lookup)
    .filter((s) => s.name)
    .map((s) => s.text.toLowerCase());

describe("glossary term linking", () => {
  it("links a family word embedded in a longer phrase", () => {
    expect(linked("Strong clarifying surfactant system")).toContain("surfactant");
  });

  it("links a hyphenated concept", () => {
    expect(linked("tacky on your high-porosity strands")).toContain("high-porosity");
  });

  it("links plural concepts", () => {
    expect(linked("lifts the cuticles")).toContain("cuticles");
  });

  it("never links a term that is not in the closed vocabulary", () => {
    expect(linked("a lovely creamy texture")).toHaveLength(0);
  });

  it("keeps the reported factor in reading order when split into glossary segments", () => {
    const segments = glossarySegments(
      "Water-based caffeine and peptide formula",
      ["caffeine", "peptide"],
      (name) => ({ display_name: name }),
    );
    expect(segments.map((segment) => segment.text).join(""))
      .toBe("Water-based caffeine and peptide formula");
    expect(segments.every((segment) => !/^(e|a)$/.test(segment.text))).toBe(true);
  });
});
