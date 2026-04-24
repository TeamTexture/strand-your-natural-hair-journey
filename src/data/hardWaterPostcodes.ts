// UK hard water postcode area prefixes (outward-code letters).
// Source: UK water authority hardness maps — South East, East, London,
// Midlands, parts of South West.
export const HARD_WATER_PREFIXES = [
  "AL", "B", "BA", "BR", "CB", "CM", "CO", "CR", "CV", "DA", "DE", "DY",
  "E", "EC", "EN", "GL", "GU", "HA", "HP", "IG", "IP", "KT", "LE", "LU",
  "ME", "MK", "N", "NG", "NN", "NR", "NW", "OX", "PE", "PO", "RG", "RH",
  "RM", "S", "SE", "SG", "SK", "SL", "SM", "SN", "SO", "SS", "ST", "SW",
  "TF", "TN", "TW", "UB", "W", "WA", "WC", "WD", "WR", "WS", "WV",
];

/** Returns true if the postcode is in a known hard-water area. */
export function isHardWaterPostcode(raw: string): boolean | null {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (cleaned.length < 2) return null;
  // Outward code = letters at the start (1 or 2 letters before any digit)
  const match = cleaned.match(/^([A-Z]{1,2})\d/);
  if (!match) return null;
  const prefix = match[1];
  return HARD_WATER_PREFIXES.includes(prefix);
}
