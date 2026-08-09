// AUTHOR CLARIFICATIONS — the amended fidelity rules.
//
// Clarifications override the manuscript, so two rules shipped in the previous
// build would otherwise reject the author's own positions. These cases lock the
// distinction she drew.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/fidelity.ts"),
  "utf8",
);

/** Extract a deterministic rule's detector without importing Deno-only code. */
function detector(id: string): (text: string) => string | null {
  const sentences = (text: string): string[] =>
    text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  const start = src.indexOf(`id: "${id}"`);
  expect(start).toBeGreaterThan(-1);
  const detectAt = src.indexOf("detect: (text) => {", start);
  const end = src.indexOf("\n};", detectAt);
  const body = src.slice(src.indexOf("{", detectAt), end);
  // eslint-disable-next-line no-new-func
  return new Function("sentences", `return (text) => ${body}`)(sentences) as (
    t: string,
  ) => string | null;
}

describe("SEALS_MOISTURE_IN — amended by clarification", () => {
  const detect = detector("seals-moisture-in");

  it("still rejects the language of preventing loss", () => {
    expect(detect("Your leave-in seals the moisture in overnight.")).toBeTruthy();
    expect(detect("This locks in moisture for days.")).toBeTruthy();
    expect(detect("A moisture-sealing cream is the final step.")).toBeTruthy();
    expect(detect("It traps moisture inside the strand.")).toBeTruthy();
  });

  it("now permits a barrier, and slowing evaporation", () => {
    expect(
      detect(
        "It creates a barrier around the moisture already in your hair, which slows the evaporation of that water.",
      ),
    ).toBeNull();
    expect(detect("This reduces evaporation, so your hair stays hydrated for longer.")).toBeNull();
    expect(detect("A barrier around the strand slows moisture loss through the day.")).toBeNull();
  });
});

describe("LOC/LCO — amended by clarification", () => {
  const detect = detector("loc-lco-daily");

  it("rejects daily or necessary framing", () => {
    expect(detect("Do the LOC method daily to keep your hair happy.")).toBeTruthy();
    expect(detect("You must do LCO every day.")).toBeTruthy();
    expect(detect("LOC is essential for type 4 hair.")).toBeTruthy();
  });

  it("permits weekly, after wash day", () => {
    expect(detect("LOC is fine weekly, after wash day.")).toBeNull();
    expect(detect("Keep LCO to once a week following your wash day.")).toBeNull();
  });
});

describe("LEAVE_IN_HYDRATES — unchanged and absolute", () => {
  const detect = detector("leave-in-hydrates");

  it("still rejects a leave-in described as hydrating", () => {
    expect(detect("Your leave-in hydrates high-porosity strands.")).toBeTruthy();
    expect(detect("This cream adds moisture to the hair.")).toBeTruthy();
  });

  it("permits the barrier framing the author uses", () => {
    expect(
      detect("Your leave-in creates a barrier that keeps your hair hydrated for longer."),
    ).toBeNull();
  });
});
