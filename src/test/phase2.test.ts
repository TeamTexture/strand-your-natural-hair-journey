// Phase 2 Step 1 contract tests. Per the user's Step 1 spec:
//   (a) selectTopicsForContext returns the porosity topic for a
//       low-porosity user
//   (b) retrievePassages throws if OPENAI_API_KEY is missing rather
//       than silently falling back (the wash-day-fallback bug class
//       Phase 1 explicitly avoided in data-decrypt-context)
//
// These imports reach into supabase/functions/_shared/. The Phase 2
// scaffolding files use Deno-style `.ts` import suffixes — modern Vite
// / Vitest resolution handles them, but we shim the Deno globals that
// the rag.ts and anthropic-client.ts files reference at module scope.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shim a minimal `Deno.env` so module-init code that touches
// `Deno.env.get(...)` doesn't blow up under jsdom. Each test sets the
// variables it actually needs.
type DenoLike = { env: { get: (k: string) => string | undefined } };
const denoEnvStore = new Map<string, string>();
const denoShim: DenoLike = {
  env: { get: (k: string) => denoEnvStore.get(k) },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Deno = denoShim;

// ─────────────────── Test 1: selector → porosity topic ───────────────────

describe("selectTopicsForContext", () => {
  it("returns the porosity topic for a low-porosity user on an ingredient analysis", async () => {
    const mod = await import(
      "../../supabase/functions/_shared/knowledge/index.ts"
    );
    const { selectTopicsForContext } = mod;

    const topics = selectTopicsForContext(
      {
        hair: {
          porosity: ["Low — tightly closed cuticle"],
          density: ["Medium"],
          scalp: ["Dry"],
          diagnosed: [],
        },
        bloodResults: [],
      },
      { function_kind: "ingredient-analysis" },
    );

    const ids = topics.map((t) => t.id);
    expect(ids).toContain("porosity");
    // The selector cap is 4; we should have at most 4 topics.
    expect(topics.length).toBeLessThanOrEqual(4);
    // Sanity: every returned topic carries at least one book_ref so the
    // citation tail can be rendered.
    for (const t of topics) {
      expect(t.book_refs.length).toBeGreaterThanOrEqual(1);
      expect(t.body.length).toBeGreaterThanOrEqual(200);
    }
  });
});

// ─────────────────── Test 2: retrievePassages throws on missing key ───────────────────

describe("retrievePassages", () => {
  beforeEach(() => {
    denoEnvStore.clear();
  });

  afterEach(() => {
    denoEnvStore.clear();
  });

  it("throws (does not silently fall back) when OPENAI_API_KEY is missing", async () => {
    // Set everything BUT OPENAI_API_KEY so the failure mode is
    // unambiguously about the missing embedding key.
    denoEnvStore.set("SUPABASE_URL", "https://example.test");
    denoEnvStore.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");

    const mod = await import("../../supabase/functions/_shared/rag.ts");
    const { retrievePassages } = mod;

    await expect(
      retrievePassages("low ferritin and shedding in perimenopausal Black British woman"),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
