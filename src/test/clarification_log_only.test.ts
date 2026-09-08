// WASH DAY TIP GUARDRAIL (2026-09-08).
//
// 1. `scalpCleanlinessWhy` accepts a real explanation ("prevents …",
//    "maintains … to support …") — the short why-word list was rejecting good
//    tips.
// 2. A LOG-only clarification note is written for the author's review and does
//    nothing else: no retry, no "rejected" outcome, served copy unchanged. Only
//    the STRIP bucket is a rejection.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordAiOutcome, logGenerationRejections, checkClarifications } = vi.hoisted(() => ({
  recordAiOutcome: vi.fn(),
  logGenerationRejections: vi.fn(async () => undefined),
  checkClarifications: vi.fn(),
}));

vi.mock("../../supabase/functions/_shared/ai-meter.ts", () => ({
  recordAiOutcome,
  getBufferedUsage: () => null,
}));
vi.mock("../../supabase/functions/_shared/evidence.ts", () => ({
  lastEvidence: () => ({ items: [], chapters: [] }),
  logGenerationRejections,
  mapClaimsToEvidence: vi.fn(),
  storeEvidenceSet: vi.fn(),
  surfaceClarifications: async () => [],
}));
vi.mock("../../supabase/functions/_shared/chapter-context.ts", () => ({
  lastSourceText: () => ({ text: "", chapters: [] }),
}));
vi.mock("../../supabase/functions/_shared/fidelity.ts", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, enforceFidelity: async (out: unknown) => out };
});
vi.mock("../../supabase/functions/_shared/blood-guardrail.ts", () => ({
  enforceBloodSafety: async (out: unknown) => out,
  enforceStyleVerbatimDeep: (out: unknown) => out,
  recordedStyles: () => [],
}));
vi.mock("../../supabase/functions/_shared/content-integrity.ts", () => ({
  enforceContentIntegrity: async () => ({ ok: true, problems: [] }),
}));
vi.mock("../../supabase/functions/_shared/terminology.ts", () => ({
  explainTerminology: vi.fn(),
  loadLexicon: async () => [],
}));
vi.mock("../../supabase/functions/_shared/policy-b.ts", () => ({
  classifyClaims: vi.fn(),
  detectManuscriptConflicts: vi.fn(),
  inspectBrandClaims: vi.fn(),
  logConflicts: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/clarifications.ts", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, checkClarifications };
});

import { scalpCleanlinessWhy } from "../../supabase/functions/_shared/clarifications.ts";
import { sanitiseAndLog } from "../../supabase/functions/_shared/citation-log.ts";

const GOAL = "length retention";

describe("scalpCleanlinessWhy — widened why-word list", () => {
  it("passes 'prevents … protecting your length retention goal'", () => {
    expect(
      scalpCleanlinessWhy(
        "In your braids, removing root debris from the scalp prevents follicle blockage, protecting your length retention goal.",
        GOAL,
      ),
    ).toEqual([]);
    // The exact tip that was rejected this morning.
    expect(
      scalpCleanlinessWhy(
        "Removing root debris prevents follicle blockage, protecting your length retention goal.",
        GOAL,
      ),
    ).toEqual([]);
  });

  it("passes 'maintains … to support length retention'", () => {
    expect(
      scalpCleanlinessWhy(
        "While your cornrows are in, removing root build-up from the scalp maintains a healthy scalp environment to support length retention.",
        GOAL,
      ),
    ).toEqual([]);
    expect(
      scalpCleanlinessWhy(
        "Removing root build-up maintains a healthy scalp environment to support length retention.",
        GOAL,
      ),
    ).toEqual([]);
  });

  it("passes 'protects your edges and length retention'", () => {
    expect(
      scalpCleanlinessWhy(
        "Keeping the scalp clean under twists protects your edges and length retention.",
        GOAL,
      ),
    ).toEqual([]);
    expect(
      scalpCleanlinessWhy("Removing root build-up protects your edges and length retention.", GOAL),
    ).toEqual([]);
  });

  it("refusal: no goal and no why-word returns one log-only rejection", () => {
    // The rule only governs protective-style copy, so the sentence names the style.
    const out = scalpCleanlinessWhy("Keep your scalp clean while your braids are in.", GOAL);
    expect(out).toHaveLength(1);
    expect(out[0].rule).toBe("clarification-scalp-cleanliness-why");
    // "why" alone is not a why-word: the word list is whole-word.
    expect(scalpCleanlinessWhy("Keep your scalp clean in braids. Preventsx.", GOAL)).toHaveLength(1);
  });
});

const TIP = {
  headline: "Cleanse between the rows",
  body: "Use a scalp cleanser on a cotton pad between your cornrows.",
};

const LOG_ONLY = {
  claim: TIP.body,
  reason: "Protective style guidance must explain why keeping the scalp clean matters.",
  rule: "clarification-scalp-cleanliness-why",
};
const STRIP = {
  claim: TIP.body,
  reason: "Washing in a protective style uses a scalp cleanser, not general shampooing.",
  rule: "clarification-protective-style-washing",
};

describe("citation-log — log-only flags are not rejections", () => {
  beforeEach(() => {
    recordAiOutcome.mockReset();
    logGenerationRejections.mockReset();
    checkClarifications.mockReset();
  });

  it("log-only flag: tip unchanged, one review row, no onRejected, outcome completed", async () => {
    checkClarifications.mockReturnValue({ strip: [], log: [LOG_ONLY], governed: [] });
    const onRejected = vi.fn();
    const served = await sanitiseAndLog(structuredClone(TIP), "wash-day-tip", {
      surface: "wash_day_tip",
      userId: "u1",
      onRejected,
    });

    expect(served).toEqual(TIP);
    expect(onRejected).not.toHaveBeenCalled();
    expect(logGenerationRejections).toHaveBeenCalledTimes(1);
    const rows = (logGenerationRejections.mock.calls[0] as unknown[])[1] as Array<{ rule: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].rule).toBe("clarification-scalp-cleanliness-why");
    expect(recordAiOutcome).toHaveBeenCalledTimes(1);
    expect(recordAiOutcome.mock.calls[0][0]).toMatchObject({ outcome: "completed", rejection_rule: null });
  });

  it("strip flag: tip stripped, onRejected once, outcome rejected", async () => {
    checkClarifications.mockReturnValue({ strip: [STRIP], log: [], governed: [] });
    const onRejected = vi.fn();
    const served = await sanitiseAndLog(structuredClone(TIP), "wash-day-tip", {
      surface: "wash_day_tip",
      userId: "u1",
      onRejected,
    });

    expect(JSON.stringify(served)).not.toContain(TIP.body);
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(onRejected.mock.calls[0][0]).toEqual(["clarification-protective-style-washing"]);
    expect(recordAiOutcome.mock.calls[0][0]).toMatchObject({
      outcome: "rejected",
      rejection_rule: "clarification-protective-style-washing",
    });
  });

  it("string test: the served log-only tip has no brackets and is not empty", async () => {
    checkClarifications.mockReturnValue({ strip: [], log: [LOG_ONLY], governed: [] });
    const served = await sanitiseAndLog(structuredClone(TIP), "wash-day-tip", { surface: "wash_day_tip" });
    const text = `${served.headline} ${served.body}`;
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).not.toContain("[");
    expect(text).not.toContain("]");
  });
});
