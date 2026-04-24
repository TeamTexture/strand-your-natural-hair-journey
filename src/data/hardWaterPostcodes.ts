// UK water hardness by postcode area (outward-code letters).
//
// Categories follow the bands shown on the Aqua Cure UK Hard Water Map
// (https://www.aquacure.co.uk/knowledge-base/uk-hard-water-map/), which in
// turn aggregates published water-authority hardness data:
//   - "hard"   = hard to very hard         (> ~200 ppm CaCO3)
//   - "medium" = slightly to moderately hard (~100–200 ppm CaCO3)
//   - "soft"   = soft to moderately soft   (< ~100 ppm CaCO3)
//
// Lookup is by the postcode area (the leading 1–2 letters of the outward
// code, e.g. "SW" in "SW1A 1AA"). Anything not listed defaults to "soft"
// (covers most of Scotland, Wales, NI, the South West and the North West).
export type WaterHardness = "hard" | "medium" | "soft";

const WATER_HARDNESS_BY_AREA: Record<string, WaterHardness> = {
  // ---- London & Home Counties (Thames / Affinity / SES — predominantly hard) ----
  E: "hard", EC: "hard", N: "hard", NW: "hard", SE: "hard", SW: "hard",
  W: "hard", WC: "hard",
  BR: "hard", CR: "hard", DA: "hard", EN: "hard", HA: "hard", IG: "hard",
  KT: "hard", RM: "hard", SM: "hard", TW: "hard", UB: "hard", WD: "hard",

  // ---- South East (Affinity, South East Water, Southern — mostly hard) ----
  AL: "hard", BN: "medium", CT: "hard", GU: "hard", HP: "hard",
  ME: "hard", MK: "hard", OX: "hard", PO: "hard", RG: "hard", RH: "hard",
  SG: "hard", SL: "hard", SO: "hard", SS: "hard", TN: "hard",

  // ---- East of England (Anglian, Cambridge — very hard chalk aquifers) ----
  CB: "hard", CM: "hard", CO: "hard", IP: "hard", LU: "hard",
  NR: "hard", PE: "hard", SN: "hard",

  // ---- East Midlands (Anglian / Severn Trent — hard) ----
  LE: "hard", LN: "hard", NG: "hard", NN: "hard",

  // ---- West Midlands & Black Country (Severn Trent — hard, some medium) ----
  B: "hard", CV: "hard", DE: "hard", DY: "medium", ST: "medium",
  TF: "medium", WR: "hard", WS: "hard", WV: "medium",

  // ---- Wessex / South West borders (Wessex / Bristol — hard limestone) ----
  BA: "hard", BH: "medium", BS: "hard", DT: "medium", GL: "hard",
  SP: "hard", TA: "medium",

  // ---- Yorkshire & Humber (mixed — Hull/Lincs hard, Pennines soft) ----
  DN: "hard", HU: "hard", YO: "medium", S: "medium", WF: "medium",
  LS: "soft", BD: "soft", HD: "soft", HG: "soft", HX: "soft",

  // ---- North West (United Utilities — predominantly soft, Pennines) ----
  BB: "soft", BL: "soft", CA: "soft", CH: "medium", CW: "medium",
  FY: "soft", L: "soft", LA: "soft", M: "soft", OL: "soft",
  PR: "soft", SK: "medium", WA: "medium", WN: "soft",

  // ---- North East (Northumbrian — soft) ----
  DH: "soft", DL: "soft", NE: "soft", SR: "soft", TS: "soft",

  // ---- South West (mostly soft granite/moorland, Wessex pockets above) ----
  EX: "soft", PL: "soft", TQ: "soft", TR: "soft",

  // ---- Wales (predominantly soft) ----
  CF: "soft", LD: "soft", LL: "soft", NP: "medium", SA: "soft", SY: "soft",

  // ---- Scotland (soft) ----
  AB: "soft", DD: "soft", DG: "soft", EH: "soft", FK: "soft",
  G: "soft", HS: "soft", IV: "soft", KA: "soft", KW: "soft",
  KY: "soft", ML: "soft", PA: "soft", PH: "soft", TD: "soft",
  ZE: "soft",

  // ---- Northern Ireland (soft) ----
  BT: "soft",
};

/** Extract the postcode area (1–2 leading letters) from a raw input. */
function extractArea(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (cleaned.length < 2) return null;
  const match = cleaned.match(/^([A-Z]{1,2})\d/);
  return match ? match[1] : null;
}

/**
 * Returns the water hardness category for a UK postcode, or `null` if the
 * input is not a recognisable UK postcode start.
 */
export function getWaterHardness(raw: string): WaterHardness | null {
  const area = extractArea(raw);
  if (!area) return null;
  return WATER_HARDNESS_BY_AREA[area] ?? "soft";
}

/**
 * Returns true if the postcode is in a hard-water area (the top band on the
 * Aqua Cure map). Returns false for medium/soft, and null for an invalid
 * postcode start.
 */
export function isHardWaterPostcode(raw: string): boolean | null {
  const hardness = getWaterHardness(raw);
  if (hardness === null) return null;
  return hardness === "hard";
}

// Backwards-compatible export — list of areas classified as hard.
export const HARD_WATER_PREFIXES = Object.entries(WATER_HARDNESS_BY_AREA)
  .filter(([, v]) => v === "hard")
  .map(([k]) => k);
