/**
 * ONE phone module for the whole app.
 *
 * Members pick a country dialling code (default United Kingdom, +44) and type
 * only the local part of the number. A leading trunk zero is stripped rather
 * than rejected: "07583748033" with +44 selected stores as "+447583748033".
 *
 * Storage format is ALWAYS E.164: "+" followed by 7-15 digits. The same rule is
 * mirrored server-side by public.normalise_phone_e164() plus a BEFORE trigger on
 * profiles.phone_number, so no other write path can store a local number.
 */

export interface DialCountry {
  /** Country name shown in the selector. */
  name: string;
  /** Dialling code without the "+". */
  dial: string;
  /** Allowed national-number lengths (digits, after the trunk zero is removed). */
  lengths?: number[];
  /** Optional national prefixes the number must start with (e.g. UK mobiles). */
  startsWith?: string[];
}

/** United Kingdom pinned first; everything else alphabetical. */
export const DIAL_COUNTRIES: DialCountry[] = [
  { name: "United Kingdom", dial: "44", lengths: [10], startsWith: ["7"] },
  { name: "Afghanistan", dial: "93" },
  { name: "Albania", dial: "355" },
  { name: "Algeria", dial: "213" },
  { name: "Angola", dial: "244" },
  { name: "Argentina", dial: "54" },
  { name: "Australia", dial: "61" },
  { name: "Austria", dial: "43" },
  { name: "Bahamas", dial: "1242" },
  { name: "Bahrain", dial: "973" },
  { name: "Bangladesh", dial: "880" },
  { name: "Barbados", dial: "1246" },
  { name: "Belgium", dial: "32" },
  { name: "Benin", dial: "229" },
  { name: "Bermuda", dial: "1441" },
  { name: "Botswana", dial: "267" },
  { name: "Brazil", dial: "55" },
  { name: "Bulgaria", dial: "359" },
  { name: "Burkina Faso", dial: "226" },
  { name: "Cameroon", dial: "237" },
  { name: "Canada", dial: "1", lengths: [10] },
  { name: "Cape Verde", dial: "238" },
  { name: "Chile", dial: "56" },
  { name: "China", dial: "86" },
  { name: "Colombia", dial: "57" },
  { name: "Congo", dial: "242" },
  { name: "Croatia", dial: "385" },
  { name: "Cyprus", dial: "357" },
  { name: "Czech Republic", dial: "420" },
  { name: "Denmark", dial: "45" },
  { name: "Dominican Republic", dial: "1809" },
  { name: "Egypt", dial: "20" },
  { name: "Estonia", dial: "372" },
  { name: "Ethiopia", dial: "251" },
  { name: "Finland", dial: "358" },
  { name: "France", dial: "33", lengths: [9] },
  { name: "Gabon", dial: "241" },
  { name: "Gambia", dial: "220" },
  { name: "Germany", dial: "49" },
  { name: "Ghana", dial: "233", lengths: [9] },
  { name: "Greece", dial: "30" },
  { name: "Grenada", dial: "1473" },
  { name: "Guyana", dial: "592" },
  { name: "Haiti", dial: "509" },
  { name: "Hong Kong", dial: "852" },
  { name: "Hungary", dial: "36" },
  { name: "Iceland", dial: "354" },
  { name: "India", dial: "91", lengths: [10] },
  { name: "Indonesia", dial: "62" },
  { name: "Ireland", dial: "353", lengths: [9] },
  { name: "Israel", dial: "972" },
  { name: "Italy", dial: "39" },
  { name: "Ivory Coast", dial: "225" },
  { name: "Jamaica", dial: "1876" },
  { name: "Japan", dial: "81" },
  { name: "Jordan", dial: "962" },
  { name: "Kenya", dial: "254", lengths: [9] },
  { name: "Kuwait", dial: "965" },
  { name: "Latvia", dial: "371" },
  { name: "Lebanon", dial: "961" },
  { name: "Lesotho", dial: "266" },
  { name: "Liberia", dial: "231" },
  { name: "Lithuania", dial: "370" },
  { name: "Luxembourg", dial: "352" },
  { name: "Malawi", dial: "265" },
  { name: "Malaysia", dial: "60" },
  { name: "Mali", dial: "223" },
  { name: "Malta", dial: "356" },
  { name: "Mauritius", dial: "230" },
  { name: "Mexico", dial: "52" },
  { name: "Morocco", dial: "212" },
  { name: "Mozambique", dial: "258" },
  { name: "Namibia", dial: "264" },
  { name: "Netherlands", dial: "31", lengths: [9] },
  { name: "New Zealand", dial: "64" },
  { name: "Nigeria", dial: "234", lengths: [10] },
  { name: "Norway", dial: "47", lengths: [8] },
  { name: "Oman", dial: "968" },
  { name: "Pakistan", dial: "92" },
  { name: "Panama", dial: "507" },
  { name: "Philippines", dial: "63" },
  { name: "Poland", dial: "48", lengths: [9] },
  { name: "Portugal", dial: "351", lengths: [9] },
  { name: "Qatar", dial: "974" },
  { name: "Romania", dial: "40" },
  { name: "Rwanda", dial: "250" },
  { name: "Saint Lucia", dial: "1758" },
  { name: "Saudi Arabia", dial: "966" },
  { name: "Senegal", dial: "221" },
  { name: "Seychelles", dial: "248" },
  { name: "Sierra Leone", dial: "232" },
  { name: "Singapore", dial: "65", lengths: [8] },
  { name: "Slovakia", dial: "421" },
  { name: "Slovenia", dial: "386" },
  { name: "Somalia", dial: "252" },
  { name: "South Africa", dial: "27", lengths: [9] },
  { name: "South Korea", dial: "82" },
  { name: "Spain", dial: "34", lengths: [9] },
  { name: "Sri Lanka", dial: "94" },
  { name: "Sudan", dial: "249" },
  { name: "Sweden", dial: "46" },
  { name: "Switzerland", dial: "41", lengths: [9] },
  { name: "Tanzania", dial: "255", lengths: [9] },
  { name: "Thailand", dial: "66" },
  { name: "Togo", dial: "228" },
  { name: "Trinidad and Tobago", dial: "1868" },
  { name: "Tunisia", dial: "216" },
  { name: "Turkey", dial: "90", lengths: [10] },
  { name: "Uganda", dial: "256", lengths: [9] },
  { name: "Ukraine", dial: "380" },
  { name: "United Arab Emirates", dial: "971" },
  { name: "United States", dial: "1", lengths: [10] },
  { name: "Uruguay", dial: "598" },
  { name: "Venezuela", dial: "58" },
  { name: "Vietnam", dial: "84" },
  { name: "Zambia", dial: "260", lengths: [9] },
  { name: "Zimbabwe", dial: "263" },
];

export const DEFAULT_DIAL = "44";

/** Canonical stored shape. */
export const E164 = /^\+[1-9]\d{6,14}$/;

/** Strip everything humans type that isn't a digit. */
export const digitsOnly = (raw: string) => (raw ?? "").replace(/\D/g, "");

/** Remove trunk zeros a member types out of habit ("07583…" → "7583…"). */
export const stripTrunkZero = (local: string) => digitsOnly(local).replace(/^0+/, "");

const countryFor = (dial: string) =>
  DIAL_COUNTRIES.find((c) => c.dial === dial) ?? DIAL_COUNTRIES[0];

/**
 * Combine a dialling code and a locally-typed number into E.164, or null when
 * the result is not a plausible number for that country.
 */
export function toE164(dial: string, local: string): string | null {
  const d = digitsOnly(dial);
  let national = stripTrunkZero(local);
  if (!d || !national) return null;
  // Pasted with the country code already included.
  if (national.startsWith(d) && national.length > d.length) {
    national = national.slice(d.length).replace(/^0+/, "");
  }
  const country = countryFor(d);
  if (country.lengths && !country.lengths.includes(national.length)) return null;
  if (!country.lengths && (national.length < 6 || national.length > 14)) return null;
  if (country.startsWith && !country.startsWith.some((p) => national.startsWith(p))) {
    return null;
  }
  const e164 = `+${d}${national}`;
  return E164.test(e164) ? e164 : null;
}

/** Plain-English error, or "" when the number is fine. */
export function phoneError(dial: string, local: string, required = true): string {
  const national = stripTrunkZero(local);
  if (!national) return required ? "Enter your mobile number" : "";
  if (/[^\d\s+().\-–—]/.test(local ?? "")) {
    return "Numbers only — remove any letters or symbols";
  }
  if (toE164(dial, local)) return "";
  const country = countryFor(digitsOnly(dial));
  if (country.lengths) {
    const want = country.lengths.join(" or ");
    if (country.startsWith && !country.startsWith.some((p) => national.startsWith(p))) {
      return `Enter a ${country.name} mobile number — it starts ${country.startsWith.join(" or ")} after the code`;
    }
    return national.length < Math.min(...country.lengths)
      ? `That's too short — a ${country.name} number has ${want} digits after the code`
      : `That's too long — a ${country.name} number has ${want} digits after the code`;
  }
  return `That doesn't look like a ${country.name} number — check the digits`;
}

/**
 * Split a stored value back into a country code and local part for editing.
 * Tolerates legacy local-format rows ("07700 900123" → +44 / 7700900123).
 */
export function splitStoredPhone(
  stored: string | null | undefined,
): { dial: string; local: string } {
  const raw = (stored ?? "").trim();
  if (!raw) return { dial: DEFAULT_DIAL, local: "" };
  let digits = digitsOnly(raw);
  if (!raw.startsWith("+") && digits.startsWith("00")) digits = digits.slice(2);
  else if (!raw.startsWith("+") && digits.startsWith("0")) {
    return { dial: DEFAULT_DIAL, local: digits.replace(/^0+/, "") };
  }
  // Longest dial code wins (e.g. 1876 before 1).
  const match = [...DIAL_COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => digits.startsWith(c.dial));
  if (match) return { dial: match.dial, local: digits.slice(match.dial.length) };
  return { dial: DEFAULT_DIAL, local: digits.replace(/^0+/, "") };
}

/** Pretty display for a stored number: "+447700900123" → "+44 7700 900123". */
export function formatPhone(stored: string | null | undefined): string {
  const raw = (stored ?? "").trim();
  if (!raw) return "";
  const { dial, local } = splitStoredPhone(raw);
  if (!local) return raw;
  const grouped = local.length > 6
    ? `${local.slice(0, local.length - 6)} ${local.slice(local.length - 6)}`
    : local;
  return `+${dial} ${grouped}`.trim();
}
