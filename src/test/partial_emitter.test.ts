import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  createPartialEmitter,
  PARTIAL_THROTTLE_MS,
} from "../../supabase/functions/_shared/partial-emitter.ts";

// CPU-TIME KILL (2026-09-04) — product-analyse re-encoded the whole accumulated
// tool JSON on every Anthropic input_json_delta (~2,000 events per scan). That
// spent the edge worker's 2s CPU allowance, the isolate was killed mid-run and
// the SSE stream closed with no `complete` and no `error`, so the member saw
// "The analysis was interrupted before it finished."

const buffer = (names: string[], closed: boolean) =>
  `{"brand":"CANTU","product_name":"Leave-In","ingredients":[${
    names.map((n) => `"${n}"`).join(",")
  }${closed ? "]" : ""}`;

describe("partial emission is throttled", () => {
  it("emits at most once per throttle window", () => {
    vi.useFakeTimers();
    try {
      const emit = vi.fn();
      const onPartial = createPartialEmitter(emit);
      // 500 deltas inside one window — the old code emitted 500 times.
      for (let i = 1; i <= 500; i++) onPartial(buffer(["Aqua"], false));
      expect(emit).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(PARTIAL_THROTTLE_MS + 1);
      onPartial(buffer(["Aqua", "Glycerin"], false));
      expect(emit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips the emit when the preview has not changed", () => {
    vi.useFakeTimers();
    try {
      const emit = vi.fn();
      const onPartial = createPartialEmitter(emit);
      onPartial(buffer(["Aqua"], false));
      vi.advanceTimersByTime(PARTIAL_THROTTLE_MS + 1);
      onPartial(buffer(["Aqua"], false) + ',"ai_summary":"more prose"');
      expect(emit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops emitting once the ingredients array has closed", () => {
    vi.useFakeTimers();
    try {
      const emit = vi.fn();
      const onPartial = createPartialEmitter(emit);
      onPartial(buffer(["Aqua", "Glycerin"], true));
      expect(emit).toHaveBeenCalledTimes(1);
      for (let i = 0; i < 20; i++) {
        vi.advanceTimersByTime(PARTIAL_THROTTLE_MS + 1);
        onPartial(buffer(["Aqua", "Glycerin"], true) + `,"ai_summary":"${"x".repeat(i)}"`);
      }
      expect(emit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports the ingredient count for the diagnostics/label-read marker", () => {
    const counts: number[] = [];
    const onPartial = createPartialEmitter(vi.fn(), { onCount: (n) => counts.push(n) });
    onPartial(buffer(["Aqua", "Glycerin"], true));
    expect(counts).toEqual([2]);
  });
});

describe("the scan functions use the throttled emitter", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("neither streaming scan emits partials per delta", () => {
    for (const p of [
      "supabase/functions/product-analyse/index.ts",
      "supabase/functions/product-analyse-url/index.ts",
    ]) {
      const src = read(p);
      expect(src).toContain("createPartialEmitter(");
      expect(src).not.toContain('(acc) => emit("partial", { json: acc })');
    }
  });

  it("the SSE branches keep the stream alive with a heartbeat", () => {
    expect(read("supabase/functions/product-analyse/index.ts")).toContain("startHeartbeat(send)");
    expect(read("supabase/functions/_shared/sse.ts")).toContain("startHeartbeat(send)");
  });

  it("the conditional search re-ask is budget guarded", () => {
    const src = read("supabase/functions/product-analyse/index.ts");
    expect(src).toContain("timeBudget.canAfford(firstReadMs + RETRY_TAIL_MS)");
    expect(src).toContain('event: "search_retry_skipped_budget"');
  });
});
