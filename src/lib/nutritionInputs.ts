// READ FIRST, ALWAYS — the input fingerprint for the Diet & Nutrition surface.
//
// WHY THIS EXISTS. Opening /nutrition-plan used to fire a request before
// anything rendered, and the "has anything changed?" test compared blood
// `updated_at` against the stored plan's `_generated_at`. A cache HIT on the
// server never moves `_generated_at`, so once a member edited a blood result
// the client asked again on EVERY visit, for ever.
//
// The fix: a small, stable fingerprint of exactly the inputs that legitimately
// change the plan —
//   • blood panels and results
//   • supplements
//   • hair profile
//   • goal, challenges and areas of concern
//   • the health/diet answers (diet pattern, alcohol)
// — plus a record of the fingerprint the member's plan was last confirmed
// against. When the two match, opening the page is a PURE READ: no request, no
// model call, no spinner. Nothing else can invalidate it.

import { supabase } from "@/integrations/supabase/client";

/** Stable, order-independent digest of the strings that make up an input set. */
const digest = (parts: string[]): string => {
  const joined = parts.slice().sort().join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < joined.length; i += 1) {
    const c = joined.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619 >>> 0;
    h2 = (h2 + c * (i + 1)) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}-${joined.length}`;
};

export interface NutritionInputs {
  fingerprint: string;
  /** True when the member has at least one blood result on file. */
  hasBlood: boolean;
}

/**
 * Reads the current input fingerprint. Six tiny indexed selects, run in
 * parallel — this is a normal page read, not a generation.
 */
export async function readNutritionInputs(userId: string): Promise<NutritionInputs> {
  const [panels, results, supplements, hair, goals, health] = await Promise.all([
    supabase.from("blood_panels").select("id, panel_date, updated_at").eq("user_id", userId),
    supabase
      .from("blood_results")
      .select("id, marker, value, status, updated_at")
      .eq("user_id", userId),
    supabase.from("user_supplements").select("id, name, dose, frequency").eq("user_id", userId),
    supabase.from("user_hair_profile").select("updated_at").eq("user_id", userId).maybeSingle(),
    supabase
      .from("user_goals")
      .select("id, updated_at")
      .eq("user_id", userId),
    supabase
      .from("user_health_profile")
      .select("updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const parts: string[] = [];
  for (const p of panels.data ?? []) {
    parts.push(`panel:${p.id}:${p.panel_date ?? ""}:${p.updated_at ?? ""}`);
  }
  for (const r of results.data ?? []) {
    parts.push(`res:${r.id}:${r.marker}:${r.value ?? ""}:${r.status ?? ""}:${r.updated_at ?? ""}`);
  }
  for (const s of supplements.data ?? []) {
    parts.push(`sup:${s.id}:${s.name ?? ""}:${s.dose ?? ""}:${s.frequency ?? ""}`);
  }
  if (hair.data?.updated_at) parts.push(`hair:${hair.data.updated_at}`);
  for (const g of goals.data ?? []) parts.push(`goal:${g.id}:${g.updated_at ?? ""}`);
  if (health.data?.updated_at) parts.push(`health:${health.data.updated_at}`);

  return {
    fingerprint: digest(parts),
    hasBlood: (results.data?.length ?? 0) > 0,
  };
}

const key = (userId: string, kind: string) => `strand_nutrition_fp:${kind}:${userId}`;

/** The fingerprint this member's stored content was last confirmed against. */
export const readConfirmedFingerprint = (userId: string, kind: string): string | null => {
  try {
    return window.localStorage.getItem(key(userId, kind));
  } catch {
    return null;
  }
};

/** Records that the stored content is current for this input set. */
export const writeConfirmedFingerprint = (
  userId: string,
  kind: string,
  fingerprint: string,
): void => {
  try {
    window.localStorage.setItem(key(userId, kind), fingerprint);
  } catch {
    /* private mode — worst case we check once more next visit */
  }
};
