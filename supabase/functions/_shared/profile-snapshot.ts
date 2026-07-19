// Server-side mirror of src/lib/profileSnapshot.ts. Keep the two in sync.
// Computes the same hash from the incoming aiContext so the edge function
// can stamp `analysis_profile_snapshot_hash` on the saved row.

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

function djb2Hex(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function currentProfileHash(ctx: Record<string, unknown> | null | undefined): string {
  const c = (ctx ?? {}) as Record<string, unknown>;
  const hp = (c.hairProfile ?? {}) as Record<string, unknown>;
  const goals = Array.isArray(c.goals) ? c.goals as Array<Record<string, unknown>> : [];
  const blood = Array.isArray(c.bloodResults) ? c.bloodResults as Array<Record<string, unknown>> : [];
  const snap = {
    currentStyle: c.currentStyle ?? null,
    hairProfile: {
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
  };
  return djb2Hex(canonicalStringify(snap));
}
