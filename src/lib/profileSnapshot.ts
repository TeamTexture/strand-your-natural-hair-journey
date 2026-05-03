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

interface SnapshotInput {
  currentStyle?: unknown;
  hairProfile?: unknown;
  healthProfile?: unknown;
  goals?: Array<Record<string, unknown>>;
  bloodResults?: Array<Record<string, unknown>>;
  professional?: unknown;
  location?: { is_hard_water_area?: boolean | null } & Record<string, unknown>;
}

/** Compute the stable profile fingerprint. Returns an 8-char hex string. */
export function currentProfileHash(ctx: SnapshotInput | null | undefined): string {
  const c = (ctx ?? {}) as SnapshotInput;
  const hp = (c.hairProfile ?? {}) as Record<string, unknown>;
  const goals = Array.isArray(c.goals) ? c.goals : [];
  const blood = Array.isArray(c.bloodResults) ? c.bloodResults : [];
  const snap = {
    currentStyle: c.currentStyle ?? null,
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
        challenge: g.challenge ?? null,
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
    isHardWater: c.location?.is_hard_water_area ?? null,
  };
  return djb2Hex(canonicalStringify(snap));
}
