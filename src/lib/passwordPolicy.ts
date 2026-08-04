/**
 * Single source of truth for STRAND password rules, strength scoring and
 * Supabase auth error mapping. Used by PasswordField and every screen where a
 * password is set (signup, reset, change password) for all roles.
 */

export const PASSWORD_MIN_LENGTH = 12;
/** Supabase hashes with bcrypt, which truncates at 72 bytes. */
export const PASSWORD_MAX_LENGTH = 72;

export type PasswordRuleKey = "length" | "lowercase" | "uppercase" | "number" | "symbol";

export interface PasswordRule {
  key: PasswordRuleKey;
  label: string;
  optional?: boolean;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    key: "length",
    label: `${PASSWORD_MIN_LENGTH} characters or more`,
    test: (v) => v.length >= PASSWORD_MIN_LENGTH,
  },
  { key: "lowercase", label: "A lowercase letter", test: (v) => /[a-z]/.test(v) },
  { key: "uppercase", label: "An uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { key: "number", label: "A number", test: (v) => /[0-9]/.test(v) },
  {
    key: "symbol",
    label: "A symbol — optional, recommended",
    optional: true,
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

export const STRENGTH_LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;

/** 0–4 segments filled. 0 means "Too short". */
export function passwordStrength(value: string): number {
  if (!value) return 0;
  const met = PASSWORD_RULES.filter((r) => r.test(value)).length;
  if (value.length < PASSWORD_MIN_LENGTH) {
    // Never advertise more than "Weak" until the length rule is satisfied.
    return value.length >= 8 && met >= 3 ? 1 : 0;
  }
  if (met <= 2) return 1;
  if (met === 3) return 2;
  if (met === 4) return 3;
  return 4;
}

export function strengthLabel(value: string): string {
  return STRENGTH_LABELS[passwordStrength(value)];
}

/** Requirements that block submission (the symbol rule never does). */
export function unmetRequiredRules(value: string): PasswordRule[] {
  return PASSWORD_RULES.filter((r) => !r.optional && !r.test(value));
}

export function isPasswordAcceptable(value: string): boolean {
  return (
    unmetRequiredRules(value).length === 0 && value.length <= PASSWORD_MAX_LENGTH
  );
}

/** Human sentence listing what's still missing, or null when acceptable. */
export function passwordProblem(value: string): string | null {
  if (!value) return "Enter a password to continue.";
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Passwords can be at most ${PASSWORD_MAX_LENGTH} characters. Please shorten it.`;
  }
  const missing = unmetRequiredRules(value);
  if (missing.length === 0) return null;
  const parts = missing.map((r) => r.label.toLowerCase());
  return `Your password still needs: ${listSentence(parts)}.`;
}

function listSentence(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export type PasswordErrorKind =
  | "weak_password"
  | "leaked_password"
  | "reauthentication_needed"
  | "same_password"
  | "rate_limit"
  | "too_long"
  | "wrong_password"
  | "generic";

export interface MappedPasswordError {
  kind: PasswordErrorKind;
  message: string;
}

interface SupabaseishError {
  code?: string;
  message?: string;
  status?: number;
  reasons?: string[];
  // Some SDK versions nest details under `error` or `body`.
  [key: string]: unknown;
}

const REASON_LABELS: Record<string, string> = {
  length: `${PASSWORD_MIN_LENGTH} characters or more`,
  characters: "a mix of letters, numbers and symbols",
  lower_case: "a lowercase letter",
  lowercase: "a lowercase letter",
  upper_case: "an uppercase letter",
  uppercase: "an uppercase letter",
  digits: "a number",
  number: "a number",
  symbols: "a symbol",
  pwned: "a password that hasn't appeared in a data breach",
};

/**
 * Maps a Supabase auth error into a distinct, human message.
 * `attempted` is the password the user tried, used to say exactly which of our
 * own requirements failed when the server only says "too weak".
 */
export function mapPasswordError(err: unknown, attempted = ""): MappedPasswordError {
  const e = (err ?? {}) as SupabaseishError;
  const code = String(e.code ?? "").toLowerCase();
  const msg = String(e.message ?? "");
  const lower = msg.toLowerCase();
  const reasons = Array.isArray(e.reasons) ? e.reasons.map(String) : [];

  if (attempted.length > PASSWORD_MAX_LENGTH || /72 characters|too long/i.test(msg)) {
    return {
      kind: "too_long",
      message: `Passwords can be at most ${PASSWORD_MAX_LENGTH} characters. Please shorten it.`,
    };
  }

  if (
    code === "reauthentication_needed" ||
    /reauthentication/i.test(lower)
  ) {
    return {
      kind: "reauthentication_needed",
      message: "For security, confirm the 6-digit code we've just emailed you.",
    };
  }

  if (code === "same_password" || /should be different|same as the old/i.test(lower)) {
    return {
      kind: "same_password",
      message: "That's your current password. Choose a new one.",
    };
  }

  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    e.status === 429 ||
    /rate limit/i.test(lower)
  ) {
    return {
      kind: "rate_limit",
      message: "Too many attempts. Try again in a few minutes.",
    };
  }

  const pwned =
    reasons.includes("pwned") ||
    /data breach|breached|pwned|known password|compromised/i.test(lower);
  if (pwned) {
    return {
      kind: "leaked_password",
      message:
        "This password has appeared in a data breach. It meets the rules above, but it's publicly known — please choose a different one.",
    };
  }

  if (code === "weak_password" || /weak|not strong enough|password should/i.test(lower)) {
    const serverParts = reasons
      .map((r) => REASON_LABELS[r.toLowerCase()])
      .filter(Boolean) as string[];
    const localParts = unmetRequiredRules(attempted).map((r) => r.label.toLowerCase());
    const parts = serverParts.length ? serverParts : localParts;
    return {
      kind: "weak_password",
      message: parts.length
        ? `This password is missing: ${listSentence(parts)}.`
        : "This password doesn't meet the requirements listed above.",
    };
  }

  if (
    code === "invalid_credentials" ||
    /invalid login credentials|current password/i.test(lower)
  ) {
    return { kind: "wrong_password", message: "Current password is incorrect." };
  }

  return {
    kind: "generic",
    message: msg || "Couldn't update your password. Please try again.",
  };
}
