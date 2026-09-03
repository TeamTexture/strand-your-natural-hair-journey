// The claim button sat on "Applying…" forever even though the edge function had
// returned 200 and the database flag was written. Two invariants guard it:
//   1. the claim mutation NEVER awaits query invalidation in onSuccess
//   2. every invoke is bounded by a client-side timeout with a friendly message
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("src/hooks/useRetentionOffer.ts", "utf8");

describe("retention offer claim cannot hang", () => {
  it("does not await invalidateQueries inside onSuccess", () => {
    expect(src).not.toMatch(/onSuccess:\s*async/);
    expect(src).not.toMatch(/await\s+Promise\.all/);
    expect(src).toMatch(/void qc\.invalidateQueries/);
  });

  it("passes an abort signal and a timeout to functions.invoke", () => {
    expect(src).toContain("INVOKE_TIMEOUT_MS");
    expect(src).toMatch(/signal:\s*controller\.signal/);
    expect(src).toMatch(/taking longer than expected/);
  });
});
