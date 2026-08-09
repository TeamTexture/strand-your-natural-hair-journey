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

/**
 * The view the account is currently INSIDE — not the roles it holds.
 * Mirrors ActiveRoleView in src/hooks/useActiveRoleView.ts.
 */
export type ConsentView = "consumer" | "pro" | "brand" | "admin";

/** Legacy alias: the role names the app stores. Kept for call sites that map roles → view. */
export type ConsentRole = "consumer" | "professional" | "brand" | "admin";

/** Every key the app knows about, mandatory or optional, for any view. */
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
 * VIEW-SCOPED REQUIREMENT MATRIX.
 *
 * Requirements belong to the view the member is currently inside, NEVER to the
 * union of the roles their account holds. An account holding member +
 * professional + brand + admin sees ONLY the member items inside My STRAND,
 * ONLY the brand items inside the brand view, and so on. A consent belonging to
 * one view must not surface in another under any circumstances.
 */
const VIEW_MANDATORY: Record<ConsentView, ConsentKey[]> = {
  // My STRAND / end user. Health data is in scope here and nowhere else.
  consumer: ["terms", "privacy", "age_18", "medical_disclaimer", "health_data"],
  // Professional view. The Professional Data Handling Undertaking is NOT here:
  // it is presented on entering the professional view, never blocks it, and
  // gates client passport access only (see has_active_client_access in the DB).
  pro: ["terms", "privacy", "age_18", "medical_disclaimer"],
  // Admin view adds no consents of its own; admins read member records and AI
  // summaries, so the medical disclaimer applies.
  admin: ["terms", "privacy", "age_18", "medical_disclaimer"],
  // A brand has no health profile and sees no guidance: no medical disclaimer,
  // no health data, and never the professional undertaking.
  brand: ["terms", "privacy", "age_18"],
};

const VIEW_OPTIONAL: Record<ConsentView, ConsentKey[]> = {
  consumer: ["personalised_offers", "marketing_email"],
  pro: ["marketing_email"],
  admin: ["marketing_email"],
  brand: ["marketing_email"],
};

/**
 * HARD ALLOWLIST — the only keys that may render anywhere inside a view.
 * Anything not listed cannot appear, even if a caller passes it in by mistake.
 * `professional_data_handling` is allowed in the professional view only.
 */
const VIEW_ALLOWED: Record<ConsentView, ConsentKey[]> = {
  consumer: [...VIEW_MANDATORY.consumer, ...VIEW_OPTIONAL.consumer],
  pro: [...VIEW_MANDATORY.pro, ...VIEW_OPTIONAL.pro, PRO_UNDERTAKING_KEY],
  admin: [...VIEW_MANDATORY.admin, ...VIEW_OPTIONAL.admin],
  brand: [...VIEW_MANDATORY.brand, ...VIEW_OPTIONAL.brand],
};

const order = (keys: ConsentKey[]) => ALL_CONSENT_KEYS.filter((k) => keys.includes(k));

/** Is this consent key permitted to render inside this view at all? */
export function keyAllowedInView(key: ConsentKey, view: ConsentView): boolean {
  return VIEW_ALLOWED[view].includes(key);
}

/** Mandatory keys for the ACTIVE VIEW, passed through the allowlist. */
export function mandatoryKeysForView(view: ConsentView): ConsentKey[] {
  return order(VIEW_MANDATORY[view].filter((k) => keyAllowedInView(k, view)));
}

/** Optional keys for the ACTIVE VIEW. These NEVER gate access. */
export function optionalKeysForView(view: ConsentView): ConsentKey[] {
  return order(VIEW_OPTIONAL[view].filter((k) => keyAllowedInView(k, view)));
}

/** Map a stored role to the view it corresponds to. */
export function viewForRole(role: ConsentRole): ConsentView {
  return role === "professional" ? "pro" : role;
}

/**
 * Clamp the active view to something the account may actually be inside.
 * A route can only put a member in a view their roles allow (RoleGate), but the
 * remembered view in sessionStorage is untrusted, so verify it here too.
 * No roles yet ⇒ treat as a member.
 */
export function resolveConsentView(
  activeView: ConsentView,
  roles: ConsentRole[],
): ConsentView {
  const allowed = new Set<ConsentView>(roles.map(viewForRole));
  if (!roles.length) return "consumer";
  return allowed.has(activeView) ? activeView : "consumer";
}

/**
 * Legacy exports — the full member matrix. Kept because settings screens and
 * tests refer to them, but gating must use the view-scoped helpers above.
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

/** Has this key ever been answered — granted OR declined — at all? */
export function isAnswered(rows: ConsentRow[], key: ConsentKey): boolean {
  return rows.some((r) => r.consent_key === key);
}

/**
 * Mandatory keys still outstanding IN THE ACTIVE VIEW (never accepted,
 * withdrawn, or accepted against an older document version).
 */
export function outstandingMandatory(
  rows: ConsentRow[],
  view: ConsentView = "consumer",
): ConsentKey[] {
  const latest = latestByKey(rows);
  return mandatoryKeysForView(view).filter((key) => {
    const row = latest[key];
    if (!row || !row.granted) return true;
    return row.document_version !== CONSENT_KEY_VERSIONS[key];
  });
}

/**
 * Optional keys that are genuinely OUTSTANDING in the active view — i.e. never
 * answered at all. An answered optional consent (granted or declined) is never
 * re-asked; it is changed from the member's own settings instead.
 */
export function unansweredOptional(
  rows: ConsentRow[],
  view: ConsentView = "consumer",
): ConsentKey[] {
  return optionalKeysForView(view).filter((key) => !isAnswered(rows, key));
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
