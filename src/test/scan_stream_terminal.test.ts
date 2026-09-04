import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// STREAM TERMINAL EVENT (2026-09-04). Scans failed with "the analysis was
// interrupted before it finished" while CPU headroom was fine, so the stream
// was closing without its terminal `complete` event. These are the invariants
// that make that either impossible or harmless.

const read = (p: string) => readFileSync(p, "utf8");

describe("the terminal complete event is never throttled or deduplicated", () => {
  it("the partial emitter only ever emits `partial`", () => {
    const src = read("supabase/functions/_shared/partial-emitter.ts");
    const emitted = [...src.matchAll(/emit\("([a-z_]+)"/g)].map((m) => m[1]);
    expect(new Set(emitted)).toEqual(new Set(["partial", "ping"]));
    expect(src).not.toContain('"complete"');
  });

  it("both scan streams emit complete directly on the stream", () => {
    for (const p of [
      "supabase/functions/product-analyse/index.ts",
      "supabase/functions/_shared/sse.ts",
    ]) {
      const src = read(p);
      expect(src).toContain('send("complete", result)');
      // The complete emit must not be routed through the partial emitter.
      expect(src).not.toMatch(/createPartialEmitter[\s\S]{0,200}complete/);
    }
  });

  it("every emitted event is traced with a sequence number", () => {
    expect(read("supabase/functions/_shared/sse-log.ts")).toContain('sse_event: event');
    for (const p of [
      "supabase/functions/product-analyse/index.ts",
      "supabase/functions/_shared/sse.ts",
    ]) {
      expect(read(p)).toContain("traceSse(");
      expect(read(p)).toContain("logStreamOutcome(");
    }
  });

  it("the heartbeat interval is cleared on every exit path", () => {
    for (const p of [
      "supabase/functions/product-analyse/index.ts",
      "supabase/functions/_shared/sse.ts",
    ]) {
      const src = read(p);
      expect(src).toMatch(/finally\s*\{[\s\S]{0,200}stopHeartbeat\(\)/);
    }
    expect(read("supabase/functions/_shared/partial-emitter.ts")).toContain("clearInterval(id)");
  });
});

describe("finished work survives a dropped stream", () => {
  it("both scans persist the guarded payload before returning it", () => {
    for (const p of [
      "supabase/functions/product-analyse/index.ts",
      "supabase/functions/product-analyse-url/index.ts",
    ]) {
      const src = read(p);
      expect(src).toContain("saveScanRecovery({");
      const save = src.indexOf("saveScanRecovery({");
      const ret = src.indexOf("return analysis as unknown as Record<string, unknown>;", save);
      expect(ret).toBeGreaterThan(save);
    }
  });

  it("the client fetches the persisted analysis when complete never arrives", () => {
    const src = read("src/lib/streamProductAnalyse.ts");
    expect(src).toContain("opts.recover");
    const recover = src.indexOf("await opts.recover()");
    const fail = src.indexOf("interrupted before it finished");
    expect(recover).toBeGreaterThan(-1);
    expect(recover).toBeLessThan(fail);
    for (const p of ["src/pages/ProductScanning.tsx", "src/hooks/useProductUrlScan.ts"]) {
      expect(read(p)).toContain("recover: () => fetchScanRecovery(scanId)");
    }
  });

  it("the recovery key only accepts a client-generated uuid", () => {
    const src = read("supabase/functions/_shared/scan-recovery.ts");
    expect(src).toContain("isValidScanId");
    expect(src).toContain("scan_recovery:");
  });
});
