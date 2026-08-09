import { supabase } from "@/integrations/supabase/client";

/**
 * SINGLE SOURCE OF TRUTH for the consent document version.
 *
 * Bump CONSENT_DOCUMENT_VERSION whenever any legal document changes, then bump
 * the individual key(s) in CONSENT_KEY_VERSIONS whose wording actually changed.
 * Members are re-gated on next launch and asked to re-accept ONLY the keys
 * whose required version no longer matches what they accepted.
 */
export const CONSENT_DOCUMENT_VERSION = "2026-08-07.1";

export type ConsentKey =
  | "terms"
  | "privacy"
  | "age_18"
  | "medical_disclaimer"
  | "health_data"
  | "professional_data_handling"
  | "personalised_offers"
  | "marketing_email";

/** The professional confidentiality undertaking — asked for outside the login gate. */
export const PRO_UNDERTAKING_KEY = "professional_data_handling" as const;

/** Roles the requirement matrix understands (mirrors public.app_role). */
export type ConsentRole = "consumer" | "professional" | "brand" | "admin";

/** Every key the app knows about, mandatory or optional, for any role. */
export const ALL_CONSENT_KEYS: ConsentKey[] = [
  "terms",
  "privacy",
  "age_18",
  "medical_disclaimer",
  "health_data",
  "professional_data_handling",
  "personalised_offers",
  "marketing_email",
];

/**
 * ROLE-AWARE REQUIREMENT MATRIX.
 *
 * A brand has no health profile, no blood panels and receives no personalised
 * hair guidance, so asking a brand to consent to processing health information
 * — or to read a medical disclaimer about guidance it never sees — is a
 * meaningless question. A professional consents to their own health data only
 * if they also use STRAND as a member; what they DO need is a confidentiality
 * undertaking over member records they are granted access to, which is a
 * different obligation and has its own key.
 *
 * Keys are the UNION across every role the account holds.
 */
const ROLE_MANDATORY: Record<ConsentRole, ConsentKey[]> = {
  consumer: ["terms", "privacy", "age_18", "medical_disclaimer", "health_data"],
  // The Professional Data Handling Undertaking is NOT here on purpose. It is
  // presented on entering the professional view, never blocks that view, and
  // gates client passport access only (see has_active_client_access in the DB).
  professional: ["terms", "privacy", "age_18", "medical_disclaimer"],
  // Admins may view member records and AI-generated summaries, so the medical
  // disclaimer applies; their own health data is only in scope via a consumer role.
  admin: ["terms", "privacy", "age_18", "medical_disclaimer"],
  brand: ["terms", "privacy", "age_18"],
};

const ROLE_OPTIONAL: Record<ConsentRole, ConsentKey[]> = {
  consumer: ["personalised_offers", "marketing_email"],
  professional: ["marketing_email"],
  admin: ["marketing_email"],
  brand: ["marketing_email"],
};

const order = (keys: ConsentKey[]) => ALL_CONSENT_KEYS.filter((k) => keys.includes(k));

/** Union of mandatory keys across the account's roles. No roles ⇒ treat as a member. */
export function mandatoryKeysForRoles(roles: ConsentRole[]): ConsentKey[] {
  const effective = roles.length ? roles : (["consumer"] as ConsentRole[]);
  const set = new Set<ConsentKey>();
  for (const role of effective) for (const key of ROLE_MANDATORY[role] ?? []) set.add(key);
  return order([...set]);
}

/** Union of optional keys across the account's roles. These NEVER gate access. */
export function optionalKeysForRoles(roles: ConsentRole[]): ConsentKey[] {
  const effective = roles.length ? roles : (["consumer"] as ConsentRole[]);
  const set = new Set<ConsentKey>();
  for (const role of effective) for (const key of ROLE_OPTIONAL[role] ?? []) set.add(key);
  return order([...set]);
}

/**
 * Legacy exports — the full member matrix. Kept because settings screens and
 * tests refer to them, but gating must use the role-aware helpers above.
 */
export const TIER1_KEYS: ConsentKey[] = ["terms", "privacy", "age_18", "medical_disclaimer"];
export const TIER2_KEYS: ConsentKey[] = ["health_data"];
export const MANDATORY_KEYS: ConsentKey[] = [...TIER1_KEYS, ...TIER2_KEYS];
/** Optional keys — these must NEVER gate access (GDPR Art. 7(4)). */
export const OPTIONAL_KEYS: ConsentKey[] = ["personalised_offers", "marketing_email"];

/**
 * The version each key currently requires. Only mandatory keys are gated.
 * When a document changes, set the affected keys to the new version and leave
 * the untouched ones alone — that's what makes partial re-acceptance work.
 */
export const CONSENT_KEY_VERSIONS: Record<ConsentKey, string> = {
  terms: CONSENT_DOCUMENT_VERSION,
  privacy: CONSENT_DOCUMENT_VERSION,
  age_18: CONSENT_DOCUMENT_VERSION,
  medical_disclaimer: CONSENT_DOCUMENT_VERSION,
  health_data: CONSENT_DOCUMENT_VERSION,
  professional_data_handling: CONSENT_DOCUMENT_VERSION,
  personalised_offers: CONSENT_DOCUMENT_VERSION,
  marketing_email: CONSENT_DOCUMENT_VERSION,
};

export interface ConsentRow {
  consent_key: string;
  granted: boolean;
  document_version: string | null;
  granted_at: string;
}

/** Latest row per key (append-only table — newest row wins). */
export function latestByKey(rows: ConsentRow[]): Partial<Record<ConsentKey, ConsentRow>> {
  const out: Partial<Record<ConsentKey, ConsentRow>> = {};
  for (const row of rows) {
    const key = row.consent_key as ConsentKey;
    const seen = out[key];
    if (!seen || new Date(row.granted_at) > new Date(seen.granted_at)) out[key] = row;
  }
  return out;
}

/** Mandatory keys still outstanding (never accepted, withdrawn, or stale version). */
export function outstandingMandatory(
  rows: ConsentRow[],
  roles: ConsentRole[] = ["consumer"],
): ConsentKey[] {
  const latest = latestByKey(rows);
  return mandatoryKeysForRoles(roles).filter((key) => {
    const row = latest[key];
    if (!row || !row.granted) return true;
    return row.document_version !== CONSENT_KEY_VERSIONS[key];
  });
}

/** Which surface a consent decision came from — stored on `user_consents.source`. */
export type ConsentSource =
  | "consent_gate"
  | "hair_profile_prompt"
  | "settings"
  | "pro_entry"
  | "passport_attempt";

const rpc = (name: string, args: Record<string, unknown>) =>
  (supabase as unknown as {
    rpc: (n: string, a: Record<string, unknown>) => Promise<{ error: unknown }>;
  }).rpc(name, args);

/** Append consent decisions. Never updates — each call writes new rows. */
export async function recordConsents(
  consents: Partial<Record<ConsentKey, boolean>>,
  source: ConsentSource = "consent_gate",
) {
  const { error } = await rpc("record_consents", {
    _version: CONSENT_DOCUMENT_VERSION,
    _consents: consents,
    _user_agent: typeof navigator === "undefined" ? null : navigator.userAgent,
    _source: source,
  });
  if (error) throw error;
}

/** Withdraw an optional consent (writes a new granted = false row). */
export async function withdrawConsent(
  key: "personalised_offers" | "marketing_email",
  source: ConsentSource = "settings",
) {
  const { error } = await rpc("withdraw_consent", {
    _key: key,
    _version: CONSENT_DOCUMENT_VERSION,
    _source: source,
  });
  if (error) throw error;
}

export async function fetchConsentRows(userId: string): Promise<ConsentRow[]> {
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => {
          order: (
            col: string,
            o: { ascending: boolean },
          ) => Promise<{ data: ConsentRow[] | null; error: unknown }>;
        };
      };
    };
  })
    .from("user_consents")
    .select("consent_key, granted, document_version, granted_at")
    .eq("user_id", userId)
    .order("granted_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
