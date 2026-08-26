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
