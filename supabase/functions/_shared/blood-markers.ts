// Single source of truth for the blood-marker whitelist used by the
// blood-extract edge function AND by the client review/test suite.
//
// Pure TS — no Deno or Supabase imports — so it deploys with edge functions
// (under supabase/functions/_shared/) and imports cleanly into the Vite/vitest
// client bundle. The client cannot own this list because edge functions cannot
// import from src/, and duplicating it would silently drift.
//
// INVARIANT: every `marker` string MUST match a key in src/data/bloodRanges.ts
// verbatim — it is written to blood_results.marker. `aliases` are extraction
// terms only (never stored).

export interface BloodMarkerDef {
  marker: string;
  unit: string;
  aliases: string[];
}

export const KNOWN_BLOOD_MARKERS: BloodMarkerDef[] = [
  { marker: "Ferritin", unit: "ng/mL", aliases: ["ferritin", "serum ferritin"] },
  { marker: "Serum Iron", unit: "μmol/L", aliases: ["iron", "serum iron"] },
  { marker: "TIBC", unit: "μmol/L", aliases: ["tibc", "total iron binding capacity"] },
  { marker: "Transferrin Saturation", unit: "%", aliases: ["transferrin saturation", "tsat", "tf sat"] },
  { marker: "Vitamin D", unit: "nmol/L", aliases: ["vitamin d", "25-oh vitamin d", "25(oh)d", "vit d"] },
  { marker: "Vitamin B12", unit: "pmol/L", aliases: ["vitamin b12", "total b12", "serum b12", "b12", "cobalamin"] },
  // Active B12 (holotranscobalamin) is reported by Lola Health and other UK
  // providers on a completely different scale to total B12 (sufficient ≥ 37.5
  // pmol/L vs total's 200–900). Its aliases must outrank total B12's short
  // aliases ("b12", "cobalamin") which are substrings of them — the matcher
  // below is longest-alias-first so this is automatic and order-independent.
  { marker: "Active B12", unit: "pmol/L", aliases: ["active b12", "active vitamin b12", "holotranscobalamin", "holo-tc", "holotc", "active-b12"] },
  { marker: "Folate", unit: "nmol/L", aliases: ["folate", "serum folate"] },
  { marker: "Vitamin A", unit: "μmol/L", aliases: ["vitamin a", "retinol"] },
  { marker: "Vitamin E", unit: "μmol/L", aliases: ["vitamin e", "tocopherol"] },
  { marker: "Biotin", unit: "pg/mL", aliases: ["biotin", "vitamin b7"] },
  { marker: "Zinc", unit: "μmol/L", aliases: ["zinc"] },
  { marker: "Magnesium", unit: "mmol/L", aliases: ["magnesium"] },
  { marker: "Selenium", unit: "μmol/L", aliases: ["selenium"] },
  { marker: "Copper", unit: "μmol/L", aliases: ["copper"] },
  { marker: "CRP", unit: "mg/L", aliases: ["crp", "c-reactive protein", "hs-crp", "high sensitivity crp"] },
  { marker: "Blood Glucose", unit: "mmol/L", aliases: ["glucose", "blood glucose", "fasting glucose"] },
  { marker: "Albumin", unit: "g/L", aliases: ["albumin"] },
  { marker: "HbA1c", unit: "mmol/mol", aliases: ["hba1c", "haemoglobin a1c", "hemoglobin a1c"] },
  { marker: "ESR", unit: "mm/hr", aliases: ["esr", "erythrocyte sedimentation rate"] },
  { marker: "ANA", unit: "titre", aliases: ["ana", "antinuclear antibody"] },
  { marker: "TSH", unit: "mU/L", aliases: ["tsh", "thyroid stimulating hormone"] },
  { marker: "Free T3", unit: "pmol/L", aliases: ["free t3", "ft3"] },
  { marker: "Free T4", unit: "pmol/L", aliases: ["free t4", "ft4"] },
  { marker: "Thyroid Antibodies (TPO)", unit: "IU/mL", aliases: ["tpo", "anti-tpo", "thyroid peroxidase antibody"] },
  { marker: "Oestrogen / Oestradiol", unit: "pmol/L", aliases: ["oestradiol", "estradiol", "e2", "oestrogen", "estrogen"] },
  { marker: "Testosterone", unit: "nmol/L", aliases: ["testosterone"] },
  { marker: "DHEA-S", unit: "μmol/L", aliases: ["dhea-s", "dheas", "dhea sulfate"] },
  { marker: "Prolactin", unit: "mIU/L", aliases: ["prolactin"] },
  { marker: "FSH", unit: "IU/L", aliases: ["fsh", "follicle stimulating hormone"] },
  { marker: "LH", unit: "IU/L", aliases: ["lh", "luteinizing hormone"] },
  { marker: "Cortisol", unit: "nmol/L", aliases: ["cortisol"] },
];

// Flat alias index, longest alias first. A longer alias (e.g.
// "holotranscobalamin") is therefore always tested before a shorter one it
// contains (e.g. "cobalamin"), so the more specific marker wins. This is
// ORDER-INDEPENDENT: the sort makes it impossible for adding a new marker to
// silently flip an existing mapping by relying on array iteration order.
interface AliasEntry {
  term: string;
  def: BloodMarkerDef;
}
const ALIAS_INDEX: AliasEntry[] = KNOWN_BLOOD_MARKERS.flatMap((def) => {
  // The canonical marker name itself is a match term (lower-cased), so a raw
  // value printed exactly as the STRAND canonical name always maps home.
  const terms = [def.marker.toLowerCase(), ...def.aliases.map((a) => a.toLowerCase())];
  return terms.map((term) => ({ term, def }));
}).sort((a, b) => b.term.length - a.term.length);

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Word-boundary match: the term must appear as a whole token, not as a
// substring glued to other alphanumerics. This is why "cobalamin" does NOT
// match "holotranscobalamin" (it's glued to "trans"), even before the
// longest-first sort kicks in. Belt and braces with the sort above.
function termMatches(haystack: string, term: string): boolean {
  if (!term) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRe(term)}([^a-z0-9]|$)`, "i").test(haystack);
}

/**
 * Deterministic canonicalisation of a raw marker string printed on a blood
 * report. Returns the STRAND canonical marker + unit, or null when nothing
 * matches (the caller keeps the raw text as an "other marker").
 *
 * Match policy: word-boundary, longest-alias-first. So:
 *   "Active B12"          → Active B12   (not Vitamin B12, even though "b12" ⊂ it)
 *   "Holotranscobalamin"  → Active B12   (not Vitamin B12, even though "cobalamin" ⊂ it)
 *   "Vitamin B12" / "B12" → Vitamin B12
 */
export function canonicaliseBloodMarker(
  rawMarker: string,
): { marker: string; unit: string } | null {
  const hay = (rawMarker ?? "").trim().toLowerCase();
  if (!hay) return null;
  for (const { term, def } of ALIAS_INDEX) {
    if (termMatches(hay, term)) return { marker: def.marker, unit: def.unit };
  }
  return null;
}
