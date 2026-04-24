// UK water hardness by postcode area (the leading 1–2 letters of the
// outward code, e.g. "SW" in "SW1A 1AA").
//
// Categorisation supplied by product spec — only HARD or SOFT bands are
// surfaced in the UI; anything not listed returns null and renders no badge.
export type WaterHardness = "hard" | "soft";

const HARD_AREAS = new Set<string>([
  // London & Home Counties (Thames / Affinity)
  "E", "EC", "N", "NW", "SE", "SW", "W", "WC",
  "BR", "CR", "DA", "EN", "HA", "IG", "KT", "RM", "SM", "TW", "UB", "WD",
  // South East (South East Water / Southern)
  "AL", "CM", "CO", "GU", "HP", "KY", "ME", "MK", "OX", "RG", "RH", "SG",
  "SL", "SS", "TN",
  // East of England (Anglian — very hard)
  "CB", "IP", "NR", "PE", "LU", "NN", "LE",
  // Midlands (Severn Trent — medium to hard)
  "B", "CV", "DE", "LN", "NG", "ST", "WS", "WV",
  // Wiltshire & Hampshire (Southern / Wessex)
  "BA", "BH", "DT", "PO", "SO", "SP",
  // Yorkshire — hard in east
  "HG", "YO",
]);

const SOFT_AREAS = new Set<string>([
  // Scotland — note: "KY" appears in BOTH lists in the spec; HARD wins because
  // Fife sits on the border of the Anglian-fed catchment in some properties.
  // Spec ordering puts it under SE first, so we keep it as hard.
  "AB", "DD", "DG", "EH", "FK", "G", "HS", "IV", "KA", "KW", "ML", "PA",
  "PH", "TD", "ZE",
  // Wales
  "CF", "LD", "LL", "NP", "SA", "SY",
  // North West (United Utilities)
  "BB", "BL", "CA", "FY", "LA", "M", "OL", "PR", "WA", "WN",
  // North East (Northumbrian)
  "DH", "DL", "NE", "SR", "TS",
  // South West
  "EX", "PL", "TQ", "TR",
  // Northern Ireland
  "BT",
  // Yorkshire — soft in west (Pennine)
  "BD", "HD", "HX", "LS", "WF",
]);

/**
 * Extract the outward-code letters from a raw postcode input. Only returns
 * a value if the input contains a space (i.e. the user has typed both the
 * outward and at least the start of the inward code).
 */
function extractOutwardArea(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase();
  // Must contain a space — that's the boundary between outward and inward.
  const spaceIdx = cleaned.indexOf(" ");
  if (spaceIdx <= 0) return null;
  const outward = cleaned.slice(0, spaceIdx);
  // Outward starts with 1–2 letters, then digit(s), optionally a trailing letter.
  const match = outward.match(/^([A-Z]{1,2})\d/);
  return match ? match[1] : null;
}

/**
 * Returns the water hardness category for a UK postcode, or `null` if the
 * input is not yet recognisable (still being typed, missing space, or in
 * an area not classified in the spec — in which case no badge is shown).
 *
 * Requires at least 5 characters including a space, e.g. "SW6 3".
 */
export function getWaterHardness(raw: string): WaterHardness | null {
  if (raw.trim().length < 5) return null;
  const area = extractOutwardArea(raw);
  if (!area) return null;
  if (HARD_AREAS.has(area)) return "hard";
  if (SOFT_AREAS.has(area)) return "soft";
  return null;
}

/**
 * Convenience: true for hard, false for soft, null for "show nothing".
 */
export function isHardWaterPostcode(raw: string): boolean | null {
  const h = getWaterHardness(raw);
  if (h === null) return null;
  return h === "hard";
}

// Backwards-compatible export — list of areas classified as hard.
export const HARD_WATER_PREFIXES = Array.from(HARD_AREAS);
