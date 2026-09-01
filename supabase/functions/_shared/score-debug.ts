// INTERNAL SCORE DEBUG TRAIL (2026-09-01)
// =======================================
// QA could not answer a simple question — "which of her profile fields actually
// reached the prompt for this scan, and how did the number get to 95?" — without
// reading raw ai_call_log. This writes one admin-only row per analysis with:
//   • which tier each key landed in (Tier 1 deterministic, Tier 2 always,
//     Tier 3 conditional health, Tier 4 withheld/guidance-only),
//   • the profile fields as they were serialised INTO the prompt, in order,
//   • the score breakdown: base (model quality axis), the concern/challenge
//     bonus, any ceiling applied, and the final number.
//
// Never member-facing. Failures are swallowed: debug logging must never break a
// scan.

export interface ScoreDebugRow {
  userId: string | null;
  functionName: string;
  subject?: string | null;
  brand?: string | null;
  generationId?: string | null;
  healthTierMode?: string | null;
  tierIncluded?: string[];
  tierWithheld?: string[];
  /** The profile object exactly as it was sent, plus the tier it sat in. */
  profileFields?: Record<string, unknown>;
  scoreBreakdown?: Record<string, unknown>;
}

/**
 * Field-by-field record of what reached the prompt. Order is preserved because
 * order is the thing being audited (see rotateProfileSignals in tiers.ts).
 */
export function describeProfileFields(
  hairProfile: unknown,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const hp = hairProfile && typeof hairProfile === "object" && !Array.isArray(hairProfile)
    ? (hairProfile as Record<string, unknown>)
    : {};
  const order = Object.keys(hp);
  const values: Record<string, unknown> = {};
  for (const key of order) {
    const v = hp[key];
    values[key] = v === null || v === undefined || (Array.isArray(v) && v.length === 0)
      ? null
      : v;
  }
  return {
    hair_profile_order: order,
    hair_profile: values,
    hair_profile_recorded: order.filter((k) => values[k] !== null),
    ...extras,
  };
}

export async function logScoreDebug(row: ScoreDebugRow): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key || !row.userId) return;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const admin = createClient(url, key, { auth: { persistSession: false } });
    await admin.from("analysis_score_debug").insert({
      user_id: row.userId,
      function_name: row.functionName,
      subject: row.subject ?? null,
      brand: row.brand ?? null,
      generation_id: row.generationId ?? null,
      health_tier_mode: row.healthTierMode ?? null,
      tier_included: row.tierIncluded ?? [],
      tier_withheld: row.tierWithheld ?? [],
      profile_fields: row.profileFields ?? {},
      score_breakdown: row.scoreBreakdown ?? {},
    });
  } catch (_e) {
    // Never let the debug trail break a scan.
  }
}

/**
 * Builds the score breakdown from the failsafe result. `floorApplied` is kept
 * as a field name for continuity, but since 2026-09-01 the only deterministic
 * adjustments are CEILINGS — the floors were removed.
 */
export function scoreBreakdown(input: {
  modelMatchScore?: unknown;
  modelQualityScore?: unknown;
  baseScore: number | null;
  finalScore: number | null;
  bonus: number;
  centrality: number;
  breadth: number;
  conflicts: number;
  supportivePluses: number;
  relevanceNote?: string | null;
  reasons?: Array<{ direction: string; factor: string }>;
}): Record<string, unknown> {
  const base = input.baseScore;
  const final = input.finalScore;
  const expected = base != null ? Math.max(0, Math.min(95, base + input.bonus)) : null;
  const capApplied = base != null && final != null && expected != null && final !== expected;
  return {
    model_match_score: typeof input.modelMatchScore === "number" ? input.modelMatchScore : null,
    model_quality_score: typeof input.modelQualityScore === "number" ? input.modelQualityScore : null,
    base_score: base,
    concern_fit_bonus: input.bonus,
    centrality: input.centrality,
    breadth: input.breadth,
    conflicts: input.conflicts,
    supportive_pluses: input.supportivePluses,
    ceiling_applied: capApplied,
    final_score: final,
    relevance_note_present: !!input.relevanceNote,
    reason_directions: (input.reasons ?? []).map((r) => `${r.direction}: ${r.factor}`),
  };
}
