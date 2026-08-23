// Country-aware postal code labelling and validation for the onboarding
// profile step. Only the UK is validated strictly — the UK postcode drives the
// hard-water lookup, so precision matters there. A small set of well-known
// formats get a friendly hint, and everything else is deliberately permissive:
// we never hard-fail a format we haven't accounted for.

export type PostalConfig = {
  /** Field label, e.g. "Postcode" / "ZIP code" / "Postal code". */
  label: string;
  /** Lower-case form for inline error copy. */
  noun: string;
  placeholder: string;
  maxLength: number;
  /** Force upper case as the member types (letters are meaningful). */
  uppercase: boolean;
  /** Strict pattern; when absent, only a minimum length is required. */
  pattern?: RegExp;
  /** Shown when the strict pattern fails. */
  formatHint?: string;
  minLength: number;
};

const UK_POSTCODE =
  /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/;

const CONFIGS: Record<string, PostalConfig> = {
  "United Kingdom": {
    label: "Postcode",
    noun: "postcode",
    placeholder: "e.g. SW6 3BX",
    maxLength: 8,
    uppercase: true,
    pattern: UK_POSTCODE,
    formatHint: "Enter a full UK postcode, e.g. SW6 3BX",
    minLength: 5,
  },
  "United States": {
    label: "ZIP code",
    noun: "ZIP code",
    placeholder: "e.g. 10012",
    maxLength: 10,
    uppercase: false,
    pattern: /^\d{5}(-\d{4})?$/,
    formatHint: "Enter a 5-digit ZIP code, e.g. 10012",
    minLength: 5,
  },
  Canada: {
    label: "Postal code",
    noun: "postal code",
    placeholder: "e.g. M5V 2T6",
    maxLength: 7,
    uppercase: true,
    pattern: /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/,
    formatHint: "Enter a Canadian postal code, e.g. M5V 2T6",
    minLength: 6,
  },
  Ireland: {
    label: "Eircode",
    noun: "Eircode",
    placeholder: "e.g. D02 AF30",
    maxLength: 8,
    uppercase: true,
    minLength: 5,
  },
  Australia: {
    label: "Postcode",
    noun: "postcode",
    placeholder: "e.g. 2000",
    maxLength: 4,
    uppercase: false,
    pattern: /^\d{4}$/,
    formatHint: "Enter a 4-digit Australian postcode, e.g. 2000",
    minLength: 4,
  },
  "New Zealand": {
    label: "Postcode",
    noun: "postcode",
    placeholder: "e.g. 1010",
    maxLength: 4,
    uppercase: false,
    pattern: /^\d{4}$/,
    formatHint: "Enter a 4-digit postcode, e.g. 1010",
    minLength: 4,
  },
  "South Africa": {
    label: "Postal code",
    noun: "postal code",
    placeholder: "e.g. 8001",
    maxLength: 4,
    uppercase: false,
    pattern: /^\d{4}$/,
    formatHint: "Enter a 4-digit postal code, e.g. 8001",
    minLength: 4,
  },
  Nigeria: {
    label: "Postal code",
    noun: "postal code",
    placeholder: "e.g. 100001",
    maxLength: 6,
    uppercase: false,
    minLength: 3,
  },
  Jamaica: {
    label: "Postal code",
    noun: "postal code",
    placeholder: "e.g. Kingston 5",
    maxLength: 16,
    uppercase: false,
    minLength: 2,
  },
};

// Anything not listed above, and the state before a country is chosen.
const GENERIC: PostalConfig = {
  label: "Postal code",
  noun: "postal code",
  placeholder: "Your postal code",
  maxLength: 16,
  uppercase: true,
  minLength: 2,
};

export const postalConfigFor = (country: string): PostalConfig =>
  CONFIGS[country] ?? GENERIC;

/** Normalises as the member types: trims stray spaces, upper-cases where meaningful. */
export const formatPostalInput = (raw: string, country: string) => {
  const cfg = postalConfigFor(country);
  const cleaned = raw.replace(/\s{2,}/g, " ").slice(0, cfg.maxLength);
  return cfg.uppercase ? cleaned.toUpperCase() : cleaned;
};

/** Returns an error message, or "" when acceptable. */
export const postalCodeError = (raw: string, country: string) => {
  const cfg = postalConfigFor(country);
  const value = raw.trim();
  if (value.length === 0) return `Enter your ${cfg.noun}`;
  if (value.length < cfg.minLength) {
    return `Enter your full ${cfg.noun}`;
  }
  if (cfg.pattern && !cfg.pattern.test(value.toUpperCase())) {
    return cfg.formatHint ?? `Check your ${cfg.noun}`;
  }
  return "";
};
