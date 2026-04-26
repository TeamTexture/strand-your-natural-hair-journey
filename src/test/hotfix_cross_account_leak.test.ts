// Hotfix smoke test (on top of 1c97c85): cross-account localStorage leak.
//
// Repro: user A signs in on a shared browser, populates `strand_*`
// localStorage (clinical profile + blood results), signs out, user B signs
// up. Before this hotfix, user B's onboarding inherited user A's clinical
// data because aiContext.ts's localStorage fallback wasn't user-scoped and
// signOut didn't purge the keys.
//
// Fixes pinned by this test:
//   1. signOut purges all `strand_*` keys except the device-level
//      walkthrough/migration flags.
//   2. The migration hook writes `strand_migration_v1_user_id` so the
//      aiContext fallback can refuse to read legacy keys when the uid
//      doesn't match.
//   3. buildAiContext for user B (with no DB rows + only user A's stale
//      strand_* keys present) returns the empty-state shape — NOT user A's
//      data.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─────────────────── Supabase client mock ───────────────────

interface QBState { data: unknown; error: unknown }
const tableStates = new Map<string, QBState>();
const builderCache = new Map<string, ReturnType<typeof makeQueryBuilder>>();

function getState(table: string): QBState {
  let s = tableStates.get(table);
  if (!s) { s = { data: null, error: null }; tableStates.set(table, s); }
  return s;
}

function makeQueryBuilder(table: string) {
  const q: Record<string, unknown> = {};
  q.select = vi.fn().mockReturnValue(q);
  q.eq = vi.fn().mockReturnValue(q);
  q.order = vi.fn().mockReturnValue(q);
  q.limit = vi.fn().mockReturnValue(q);
  q.maybeSingle = vi.fn(async () => {
    const s = getState(table);
    return { data: s.data, error: s.error };
  });
  q.then = (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
    const s = getState(table);
    resolve({ data: Array.isArray(s.data) ? s.data : [], error: s.error });
  };
  return q;
}

function getBuilder(table: string) {
  if (!builderCache.has(table)) builderCache.set(table, makeQueryBuilder(table));
  return builderCache.get(table)!;
}

function setTable(table: string, state: Partial<QBState>) {
  Object.assign(getState(table), state);
}

const mockGetUser = vi.fn();
const mockInvoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => getBuilder(table),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

beforeEach(() => {
  tableStates.clear();
  builderCache.clear();
  mockGetUser.mockReset();
  mockInvoke.mockReset();
  // Cached decrypted-context module state needs clearing too — otherwise a
  // previous test's resolved promise leaks across cases.
  vi.resetModules();
  if (typeof window !== "undefined") localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────── Test 1: signOut purges strand_* keys ───────────────────

describe("hotfix: signOut purges strand_* localStorage keys", () => {
  it("removes user-scoped keys but preserves walkthrough + migration flags", async () => {
    const { purgeStrandUserScopedKeys, STRAND_PRESERVED_KEYS } = await import(
      "@/lib/strandLocalStorage"
    );

    // User A's stale payload from a prior session.
    localStorage.setItem("strand_profile_basic", JSON.stringify({ name: "Alice" }));
    localStorage.setItem("strand_hair_profile", JSON.stringify({ scalp: ["Dry"] }));
    localStorage.setItem("strand_health_profile", JSON.stringify({ diet: "omnivore" }));
    localStorage.setItem("strand_blood_results", JSON.stringify([{ marker: "Ferritin", value: 12 }]));
    localStorage.setItem("strand_last_wash_date", "2026-04-20");
    localStorage.setItem("strand_wash_history", JSON.stringify([{ date: "2026-04-20" }]));
    // Device-level keys that MUST survive the purge.
    localStorage.setItem("strand_walkthrough_complete", "true");
    localStorage.setItem("strand_migration_v1_done", "2026-04-26T10:00:00Z");
    localStorage.setItem("strand_migration_v1_user_id", "user-A");
    // Unrelated key from another app — must not be touched.
    localStorage.setItem("not_strand_thing", "keep me");

    purgeStrandUserScopedKeys();

    // User-scoped keys are gone.
    expect(localStorage.getItem("strand_profile_basic")).toBeNull();
    expect(localStorage.getItem("strand_hair_profile")).toBeNull();
    expect(localStorage.getItem("strand_health_profile")).toBeNull();
    expect(localStorage.getItem("strand_blood_results")).toBeNull();
    expect(localStorage.getItem("strand_last_wash_date")).toBeNull();
    expect(localStorage.getItem("strand_wash_history")).toBeNull();
    expect(localStorage.getItem("strand_migration_v1_user_id")).toBeNull();

    // Preserved keys survived.
    for (const key of STRAND_PRESERVED_KEYS) {
      expect(localStorage.getItem(key)).not.toBeNull();
    }
    // Non-strand_ keys untouched.
    expect(localStorage.getItem("not_strand_thing")).toBe("keep me");
  });
});

// ─────────────── Test 2: end-to-end leak guard via buildAiContext ───────────────

describe("hotfix: buildAiContext refuses to leak user A's data to user B", () => {
  it("returns empty-state slices for user B when only user A's strand_* keys exist", async () => {
    // Simulate the post-signup state: user A signed in, populated localStorage
    // (including the migration-flag user-id pointing at user A), then signed
    // out. signOut purges most keys but the migration flags survive (per the
    // preserve list — that's what makes this test meaningful: the
    // user_id flag still points at user A, so the aiContext fallback gate
    // must refuse to read any leftover legacy keys).
    //
    // To exercise the gate specifically we re-add a few legacy keys here as
    // if they'd been re-cached by a stale code path. The gate must ignore
    // them because `strand_migration_v1_user_id` !== user B's id.
    localStorage.setItem("strand_migration_v1_done", "2026-04-26T10:00:00Z");
    localStorage.setItem("strand_migration_v1_user_id", "user-A");
    localStorage.setItem(
      "strand_hair_profile",
      JSON.stringify({ diameter: ["Medium"], scalp: ["Dry"], diagnosed: ["Traction alopecia"] }),
    );
    localStorage.setItem(
      "strand_health_profile",
      JSON.stringify({ lifeStage: ["Perimenopause"], diet: "vegan" }),
    );
    localStorage.setItem(
      "strand_current_style",
      JSON.stringify({ current_hairstyle: "Box braids", style_set_at: "2026-04-01T00:00:00Z" }),
    );
    localStorage.setItem(
      "strand_professional",
      JSON.stringify({ name: "Dr A", type: "Dermatologist" }),
    );
    localStorage.setItem("strand_last_wash_date", "2026-04-20");
    localStorage.setItem(
      "strand_wash_history",
      JSON.stringify([{ date: "2026-04-20", notes: "User A wash" }]),
    );

    // Now user B is signed in.
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-B" } } });

    // User B has no rows in any clinical table or content table.
    setTable("blood_results", { data: [] });
    setTable("ingredient_lists", { data: [] });
    setTable("wash_days", { data: [] });
    setTable("user_products", { data: [] });
    setTable("product_ratings", { data: [] });
    setTable("user_goals", { data: [] });
    setTable("profiles", { data: null });
    setTable("user_hair_profile", { data: null });
    setTable("user_health_profile", { data: null });
    setTable("user_style_profile", { data: null });
    setTable("user_professionals", { data: null });
    setTable("user_medications", { data: [] });

    // The decrypt edge function would normally be called for user B; return
    // empty so any leak would HAVE to come from localStorage.
    mockInvoke.mockResolvedValue({ data: null, error: null });

    const { buildAiContext } = await import("@/lib/aiContext");
    const ctx = await buildAiContext();

    // Critical: NONE of user A's strand_* data has bled into user B's context.
    expect(ctx.hairProfile).toBeNull();
    expect(ctx.healthProfile).toBeNull();
    expect(ctx.currentStyle).toBeNull();
    expect(ctx.professional).toBeNull();
    expect(ctx.bloodResults).toEqual([]);

    // Wash history must NOT contain user A's stale localStorage entry.
    expect(ctx.history.last_3_wash_days).toEqual([]);

    // Sanity: empty-state shape, not partial bleed.
    expect(ctx.history.avoid_ingredients).toEqual([]);
    expect(ctx.history.favourite_ingredients).toEqual([]);
    expect(ctx.shelf).toEqual([]);
  });

  it("DOES read localStorage when the migration flag matches the current user", async () => {
    // Positive control: the gate must not be over-strict — when the legacy
    // payload genuinely belongs to the current user (e.g. mid-migration),
    // it should still be readable.
    localStorage.setItem("strand_migration_v1_user_id", "user-B");
    localStorage.setItem(
      "strand_hair_profile",
      JSON.stringify({ diameter: ["Medium"], scalp: ["Dry"] }),
    );
    localStorage.setItem(
      "strand_wash_history",
      JSON.stringify([{ date: "2026-04-20" }]),
    );

    mockGetUser.mockResolvedValue({ data: { user: { id: "user-B" } } });
    setTable("blood_results", { data: [] });
    setTable("ingredient_lists", { data: [] });
    setTable("wash_days", { data: [] });
    setTable("user_products", { data: [] });
    setTable("product_ratings", { data: [] });
    setTable("user_goals", { data: [] });
    setTable("profiles", { data: null });
    setTable("user_hair_profile", { data: null });
    setTable("user_health_profile", { data: null });
    setTable("user_style_profile", { data: null });
    setTable("user_professionals", { data: null });
    setTable("user_medications", { data: [] });
    mockInvoke.mockResolvedValue({ data: null, error: null });

    const { buildAiContext } = await import("@/lib/aiContext");
    const ctx = await buildAiContext();

    // Hair profile sourced from localStorage because the uid matches.
    expect(ctx.hairProfile).not.toBeNull();
    expect(ctx.history.last_3_wash_days.length).toBe(1);
  });
});
