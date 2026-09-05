// Stable fingerprint of the user's profile for the parts of the AI context
// that change the SHAPE of a product analysis. Used to decide whether a
// re-scan should hit the cached `user_products` row or invoke the edge
// function for a fresh analysis.
//
// CRITICAL: keep the field selection narrow. We exclude
// history.last_3_wash_days, flagged_ingredients, low/high-rated products,
// and shelf — those churn on every wash day or scan and would invalidate
// every analysis constantly.
//
// Mirrored verbatim in supabase/functions/_shared/profile-snapshot.ts so
// the server stamps the same hash the client computes.

type Json = unknown;

function canonicalStringify(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalStringify).join(",") + "]";
  }
  const obj = value as Record<string, Json>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(obj[k])).join(",") + "}";
}

// djb2, 32-bit. Stable, fast, dependency-free. Output: 8-char hex.
function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// Challenges live in `user_goals.challenges` (text[]). The singular
// `challenge` column is deprecated and read only as a fallback for a
// pre-migration cached row. Kept inline (not imported) so this file stays
// dependency-free and byte-identical on client and server.
function goalChallenges(g: Record<string, unknown>): string[] {
  const raw = g.challenges;
  const list = Array.isArray(raw) ? raw.map((c) => String(c ?? "").trim()).filter(Boolean) : [];
  if (list.length > 0) return list.slice().sort();
  const legacy = String(g.challenge ?? "").trim();
  return legacy ? [legacy] : [];
}

interface SnapshotInput {
  currentStyle?: unknown;
  hairProfile?: unknown;
  healthProfile?: unknown;
  goals?: Array<Record<string, unknown>>;
  bloodResults?: Array<Record<string, unknown>>;
  professional?: unknown;
  /** Tips level (1-4) — depth of guidance changes the analysis itself. */
  tipsLevel?: unknown;
}

/** Compute the stable profile fingerprint. Returns an 8-char hex string. */
export function currentProfileHash(ctx: SnapshotInput | null | undefined): string {
  const c = (ctx ?? {}) as SnapshotInput;
  const hp = (c.hairProfile ?? {}) as Record<string, unknown>;
  const goals = Array.isArray(c.goals) ? c.goals : [];
  const blood = Array.isArray(c.bloodResults) ? c.bloodResults : [];
  // `days_in_style`, `style_set_on` and `planned_change_date` are deliberately
  // excluded: days_in_style increments daily, which changed this hash every
  // single day and invalidated every cached analysis.
  //
  // `current_hairstyle` IS included (2026-09-05): the style she is actually
  // wearing changes the guidance, so a style change must invalidate stored
  // analysis rather than serving copy written for the previous style. It is a
  // stable string — it only moves when she changes style.
  const cs = (c.currentStyle ?? null) as Record<string, unknown> | null;
  const snap = {
    currentStyle: cs
      ? {
          current_hairstyle: cs.current_hairstyle ?? null,
          default_style: cs.default_style ?? null,
          planned_next_style: cs.planned_next_style ?? null,
        }
      : null,

    hairProfile: {
      // Only the dimensions that affect formulation advice.
      curlPattern: hp.surface_texture ?? hp.texture ?? null,
      density: hp.density ?? null,
      porosity: hp.porosity ?? null,
      diameter: hp.diameter ?? null,
      elasticity: hp.elasticity ?? null,
      scalp: hp.scalp ?? null,
      diagnosed: hp.diagnosed ?? null,
    },
    goals: goals
      .map((g) => ({
        kind: g.kind ?? null,
        title: g.title ?? null,
        challenges: goalChallenges(g),
        target_text: g.target_text ?? null,
        status: g.status ?? null,
      }))
      .sort((a, b) => String(a.title).localeCompare(String(b.title))),
    blood: blood
      .map((b) => ({
        marker: b.marker ?? null,
        value: b.value ?? null,
        unit: b.unit ?? null,
        status: b.status ?? null,
      }))
      .sort((a, b) => String(a.marker).localeCompare(String(b.marker))),
    professional: c.professional ?? null,
  };
  const level = Number(c.tipsLevel);
  const tl = level >= 1 && level <= 4 ? Math.round(level) : 2;
  return `${djb2Hex(canonicalStringify(snap))}:tl${tl}`;
}

// ── INGREDIENT FINGERPRINT ────────────────────────────────────────────────
// A stored analysis is only valid for the INCI list it was computed against.
// Order-insensitive and case-insensitive so a re-read of the same pack (which
// can reorder or re-case names) does NOT invalidate a valid stored analysis.
export function ingredientsFingerprint(list: unknown): string | null {
  if (!Array.isArray(list)) return null;
  const names = list
    .map((v) => String(v ?? "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .sort();
  if (names.length === 0) return null;
  return djb2Hex(names.join("|"));
}
