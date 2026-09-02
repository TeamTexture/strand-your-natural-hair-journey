/**
 * UK mobile number validation + normalisation.
 *
 * One module, used by the client (inline feedback on registration and the
 * profile-details editor) and mirrored by a Postgres CHECK constraint on
 * `profiles.phone_number` so a crafted request can't bypass it.
 *
 * Storage format is always E.164: `+447XXXXXXXXX` (13 chars).
 */

/** Accepted UK mobile inputs, once spaces/brackets/dashes are stripped. */
const UK_LOCAL = /^07\d{9}$/; // 07700900123
const UK_PLUS = /^\+447\d{9}$/; // +447700900123
const UK_INTL_00 = /^00447\d{9}$/; // 00447700900123
const UK_BARE_44 = /^447\d{9}$/; // 447700900123 (pasted without + or 00)

/** Canonical stored shape — the DB constraint uses the same pattern. */
export const UK_MOBILE_E164 = /^\+447\d{9}$/;

/** Strip formatting humans type: spaces, brackets, dots, dashes, NBSPs. */
export const stripPhoneFormatting = (raw: string) =>
  (raw ?? "").replace(/[\s\u00A0().\-–—]/g, "");

/**
 * Normalise any accepted UK mobile format to `+447XXXXXXXXX`.
 * Returns null when the input is not a valid UK mobile.
 */
export const normaliseUkMobile = (raw: string): string | null => {
  const cleaned = stripPhoneFormatting(raw);
  if (!cleaned) return null;
  // Anything other than an optional leading + and digits is invalid.
  if (!/^\+?\d+$/.test(cleaned)) return null;
  if (UK_LOCAL.test(cleaned)) return `+44${cleaned.slice(1)}`;
  if (UK_PLUS.test(cleaned)) return cleaned;
  if (UK_INTL_00.test(cleaned)) return `+${cleaned.slice(2)}`;
  if (UK_BARE_44.test(cleaned)) return `+${cleaned}`;
  return null;
};

export const isUkMobile = (raw: string) => normaliseUkMobile(raw) !== null;

/**
 * Inline error message, or "" when valid. `required` lets the profile editor
 * treat an empty box as "leave it alone" while registration demands a number.
 */
export const ukMobileError = (raw: string, required = true): string => {
  const cleaned = stripPhoneFormatting(raw);
  if (!cleaned) return required ? "Enter your UK mobile number" : "";
  if (!/^\+?\d+$/.test(cleaned)) {
    return "Numbers only — remove any letters or symbols";
  }
  if (normaliseUkMobile(cleaned)) return "";
  const digits = cleaned.replace(/\D/g, "");
  if (/^0?7/.test(digits) || /^(00)?447/.test(digits)) {
    return digits.length < 11
      ? "That's too short — a UK mobile is 11 digits, e.g. 07700 900123"
      : "That's too long — a UK mobile is 11 digits, e.g. 07700 900123";
  }
  return "Enter a UK mobile number starting 07 (or +447)";
};

/** Pretty display: `+447700900123` → `07700 900123`. */
export const formatUkMobile = (stored: string | null | undefined): string => {
  if (!stored) return "";
  const e164 = normaliseUkMobile(stored);
  if (!e164) return stored;
  const local = `0${e164.slice(3)}`;
  return `${local.slice(0, 5)} ${local.slice(5)}`;
};
