// Server-authoritative regeneration gate for the nutrition / blood surfaces.
//
// WHY THIS EXISTS (2026-08-26). nutrition-plan fired 17 times in 11 minutes for
// one member (380k tokens) because the cache signature was built from whole
// client-supplied context objects (hairProfile, healthProfile, goals, raw blood
// rows). Any incidental field — an updated_at, a re-ordered array — produced a
// different signature, so every view paid for a cold generation. On top of
// that, BloodAiSummary computed `force` from a localStorage fingerprint and
// passed it through to a nutrition-plan prewarm, so simply opening the blood
// summary forced a regeneration of BOTH surfaces.
//
// The rule these helpers enforce: a surface regenerates ONLY when the member
// asks for it (an explicit `force` from a control she tapped) or when her blood
// data actually changes. Opening a page, re-rendering, navigating back or
// touching an unrelated profile field can never spend a token.
//
// Only a COMPLETE payload is ever written (the caller validates first), so a
// failed or truncated generation is never served as if it were a result.

// deno-lint-ignore no-explicit-any
type Client = any;

/**
 * A stable fingerprint of the member's blood data, read from the database
 * rather than from anything the client sends. Changes if and only if a panel or
 * a result is added, removed or edited.
 */
export async function bloodFingerprint(
  supabase: Client,
  userId: string,
): Promise<string> {
  const [{ data: panels }, { data: results }] = await Promise.all([
    supabase
      .from("blood_panels")
      .select("id, panel_date, updated_at")
      .eq("user_id", userId),
    supabase
      .from("blood_results")
      .select("id, marker, value, status, panel_id, updated_at")
      .eq("user_id", userId),
  ]);

  const panelPart = ((panels ?? []) as Array<Record<string, unknown>>)
    .map((p) => `${p.id}:${p.panel_date ?? ""}:${p.updated_at ?? ""}`)
    .sort()
    .join("|");
  const resultPart = ((results ?? []) as Array<Record<string, unknown>>)
    .map(
      (r) =>
        `${r.panel_id ?? ""}/${r.marker}:${r.value ?? ""}:${r.status ?? ""}:${r.updated_at ?? ""}`,
    )
    .sort()
    .join("|");

  return sha(`${panelPart}#${resultPart}`);
}

/**
 * A stable fingerprint of the OTHER member data that legitimately changes a
 * nutrition plan (2026-09-05): her supplements, her hair profile, her goal /
 * challenges / areas of concern, and her health & diet answers. Read from the
 * database, never from the request body, so an incidental client field can
 * never move it.
 */
export async function nutritionInputFingerprint(
  supabase: Client,
  userId: string,
): Promise<string> {
  const [supplements, hair, goals, health] = await Promise.all([
    supabase.from("user_supplements").select("id, name, dose, frequency").eq("user_id", userId),
    supabase.from("user_hair_profile").select("updated_at").eq("user_id", userId).maybeSingle(),
    supabase.from("user_goals").select("id, updated_at").eq("user_id", userId),
    supabase.from("user_health_profile").select("updated_at").eq("user_id", userId).maybeSingle(),
  ]);

  const parts: string[] = [];
  for (const s of (supplements.data ?? []) as Array<Record<string, unknown>>) {
    parts.push(`sup:${s.id}:${s.name ?? ""}:${s.dose ?? ""}:${s.frequency ?? ""}`);
  }
  if (hair.data?.updated_at) parts.push(`hair:${hair.data.updated_at}`);
  for (const g of (goals.data ?? []) as Array<Record<string, unknown>>) {
    parts.push(`goal:${g.id}:${g.updated_at ?? ""}`);
  }
  if (health.data?.updated_at) parts.push(`health:${health.data.updated_at}`);

  return sha(parts.sort().join("|"));
}

/** Short, stable SHA-256 hex digest. */
export async function sha(input: string): Promise<string> {
  try {
    const buf = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  } catch {
    return String(input.length);
  }
}

/**
 * Returns the stored payload when it was generated from the same signature.
 * A signature mismatch is the ONLY reason to regenerate without `force`.
 */
export async function readSurfaceCache(
  supabase: Client,
  userId: string,
  kind: string,
  sig: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("ai_summaries")
    .select("payload")
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();
  const payload = (data?.payload ?? null) as Record<string, unknown> | null;
  if (!payload) return null;
  return payload._sig === sig ? payload : null;
}

/**
 * Persists a verified payload under its signature. Callers MUST validate
 * completeness before calling: nothing partial or failed is stored.
 */
export async function writeSurfaceCache(
  supabase: Client,
  userId: string,
  kind: string,
  sig: string,
  payload: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const stamped = {
    ...payload,
    ...extra,
    _sig: sig,
    _generated_at: new Date().toISOString(),
  } as Record<string, unknown>;

  const { data: prior } = await supabase
    .from("ai_summaries")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();

  if (prior?.id) {
    await supabase
      .from("ai_summaries")
      .update({ payload: stamped, updated_at: new Date().toISOString() })
      .eq("id", prior.id);
  } else {
    await supabase
      .from("ai_summaries")
      .insert({ user_id: userId, kind, payload: stamped });
  }
  return stamped;
}
