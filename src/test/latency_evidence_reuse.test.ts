import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * PART 4 (2026-09-01) — latency invariants for the product scan.
 *
 * The manuscript evidence gather (stage 1) is the second-largest wait on a
 * scan and depends only on the member's own recorded facts. These tests hold
 * the three properties that make it cheap:
 *  1. the stage 1 cache is consulted BEFORE the whole-chapter read,
 *  2. clarifications and the terminology lexicon load alongside stage 1, not
 *     behind it,
 *  3. the scan starts one gather early and hands the SAME set to the writer
 *     (every attempt) — never a second gather.
 */

const read = (p: string) => readFileSync(p, "utf8");

describe("stage 1 evidence gather", () => {
  const evidence = read("supabase/functions/_shared/evidence.ts");

  it("checks the cache before loading whole chapters", () => {
    const cacheAt = evidence.indexOf("const persisted = await readPersistedEvidence(ck)");
    const rowsAt = evidence.indexOf("const rows = await loadChapterRows(chapters)");
    expect(cacheAt).toBeGreaterThan(-1);
    expect(rowsAt).toBeGreaterThan(-1);
    expect(cacheAt).toBeLessThan(rowsAt);
  });

  it("loads clarifications and the lexicon alongside the gather", () => {
    expect(evidence).toMatch(
      /Promise\.all\(\[\s*gatherEvidence\(input\),\s*surfaceClarifications\(input\.surface\),\s*loadLexicon\(\),/,
    );
  });

  it("still notes the evidence set for the stage 3 verification", () => {
    expect(evidence).toContain("noteEvidence(input.fn, set)");
  });
});

describe("product-analyse evidence reuse", () => {
  const fn = read("supabase/functions/product-analyse/index.ts");
  const prompt = read("supabase/functions/_shared/build-prompt.ts");

  it("starts the gather in parallel with the vocabulary load", () => {
    expect(fn).toContain("const [vocabulary, prefetchedEvidence, prefetchedGrounding]");
    expect(fn).toContain("evidencePromptBlock({");
  });

  it("starts it only after the cache and cap checks, so a cache hit spends nothing", () => {
    const cache = fn.indexOf("if (cachedRow?.payload)");
    const cap = fn.indexOf("if (capped) return capped;");
    const gather = fn.indexOf("const evidencePromise");
    expect(cache).toBeLessThan(gather);
    expect(cap).toBeLessThan(gather);
  });

  it("hands the resolved set to the writer instead of re-gathering per attempt", () => {
    expect(fn).toContain("prefetchedEvidence: prefetchedEvidence");
    expect(fn).toContain("prefetched_evidence: args.prefetchedEvidence");
    expect(prompt).toContain("input.prefetched_evidence ?? await evidencePromptBlock(");
  });

  it("keeps streaming on, and streams the deterministic Tier 1 findings first", () => {
    expect(fn).toContain('emit?.("tier1"');
    expect(fn).toContain('emit("partial"');
  });
});
