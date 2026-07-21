// UK postcode → water hardness lookup.
// Values are approximate averages sourced from published UK water-supplier
// hardness maps (Thames, Anglian, Southern, Yorkshire, Scottish Water, etc.).
// This is a "beta" lookup — coarse by outward postcode area only; accuracy
// improves with a purchased dataset later.

export type Hardness = "soft" | "moderate" | "hard" | "very-hard";

export interface HardWaterResult {
  hardness: Hardness;
  label: string;
  explanation: string;
  area: string; // e.g. "SW6"
}

// Outward-code prefix (2-4 chars) → hardness classification.
// Ordered longest-prefix first when matching.
const MAP: Record<string, Hardness> = {
  // ── Very hard: chalk/limestone belts (Thames, Anglian, Southern) ──
  // London (mostly Thames Water — very hard)
  E: "very-hard", EC: "very-hard", N: "very-hard", NW: "very-hard",
  W: "very-hard", WC: "very-hard", SW: "very-hard", SE: "very-hard",
  // Home counties
  KT: "very-hard", CR: "very-hard", BR: "very-hard", DA: "very-hard",
  RM: "very-hard", IG: "very-hard", EN: "very-hard", HA: "very-hard",
  UB: "very-hard", TW: "very-hard", WD: "very-hard", SM: "very-hard",
  // Anglian
  CB: "very-hard", CM: "very-hard", CO: "very-hard", IP: "very-hard",
  NR: "very-hard", PE: "very-hard", SG: "very-hard", SS: "very-hard",
  LU: "very-hard", MK: "very-hard", AL: "very-hard", HP: "very-hard",
  // South (Southern / South East)
  RG: "very-hard", RH: "very-hard", GU: "very-hard", ME: "very-hard",
  CT: "very-hard", TN: "very-hard", BN: "very-hard", PO: "very-hard",
  SO: "very-hard", SP: "very-hard", OX: "very-hard", NN: "very-hard",
  LE: "very-hard", LN: "very-hard", HU: "very-hard",

  // ── Hard ──
  BS: "hard", BA: "hard", GL: "hard", SN: "hard", BH: "hard",
  DT: "hard", DN: "hard", S: "hard", DE: "hard", NG: "hard",
  ST: "hard", CV: "hard", B: "hard", DY: "hard", WR: "hard",
  WS: "hard", WV: "hard", HR: "hard", TF: "hard", SY: "hard",

  // ── Moderate ──
  CH: "moderate", CW: "moderate", WA: "moderate", WN: "moderate",
  M: "moderate", OL: "moderate", SK: "moderate", BB: "moderate",
  PR: "moderate", FY: "moderate", L: "moderate", BL: "moderate",
  YO: "moderate", HD: "moderate", HX: "moderate", BD: "moderate",
  WF: "moderate", LS: "moderate", TS: "moderate", DL: "moderate",
  DH: "moderate", NE: "moderate", SR: "moderate", CA: "moderate",
  LA: "moderate", HG: "moderate",

  // ── Soft (upland / granite: Wales, SW peninsula, Scotland, NI) ──
  EX: "soft", PL: "soft", TQ: "soft", TR: "soft", TA: "soft",
  LL: "soft", SA: "soft", CF: "soft", NP: "soft", LD: "soft",
  SY19: "soft", SY20: "soft", SY23: "soft", SY24: "soft", SY25: "soft",
  AB: "soft", DD: "soft", EH: "soft", FK: "soft", G: "soft",
  IV: "soft", KA: "soft", KW: "soft", KY: "soft", ML: "soft",
  PA: "soft", PH: "soft", TD: "soft", ZE: "soft", HS: "soft",
  BT: "soft",
};

const LABELS: Record<Hardness, string> = {
  soft: "Soft water",
  moderate: "Moderately hard",
  hard: "Hard water",
  "very-hard": "Very hard water",
};

const EXPLANATIONS: Record<Hardness, string> = {
  soft:
    "Low mineral content. Your hair rinses cleanly and shampoo lathers easily — you'll rarely need a chelating step.",
  moderate:
    "A little calcium is present. Watch for gradual dullness on curls — a monthly clarifying wash usually keeps hair light.",
  hard:
    "Calcium and magnesium build up on the strand, which can dull curl pattern and lock in product. Plan a clarifying cleanse every 2–4 washes.",
  "very-hard":
    "High mineral load. Expect visible build-up, drier feel and duller curls without regular chelation. A shower filter and monthly chelating shampoo make a real difference.",
};

/** Return water hardness for a UK postcode (any format). Null if unrecognised. */
export function lookupHardWater(raw: string | null | undefined): HardWaterResult | null {
  if (!raw) return null;
  const pc = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (pc.length < 2) return null;

  // Extract the outward code (letters + digits before the inward code).
  // Outward is 2-4 chars: e.g. "SW6", "SW1A", "M1", "B1", "IG11".
  const m = pc.match(/^([A-Z]{1,2}\d[A-Z\d]?)/);
  if (!m) return null;
  const outward = m[1];
  const areaLetters = outward.match(/^[A-Z]{1,2}/)?.[0] ?? "";

  // Longest-prefix match: try full outward first, then area letters.
  const candidates = [outward, areaLetters].filter(Boolean);
  for (const key of candidates) {
    if (MAP[key]) {
      return {
        hardness: MAP[key],
        label: LABELS[MAP[key]],
        explanation: EXPLANATIONS[MAP[key]],
        area: outward,
      };
    }
  }
  return null;
}
