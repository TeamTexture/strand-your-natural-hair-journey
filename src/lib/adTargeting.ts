// Personalised ad targeting — v1 vocabulary helpers.
//
// TARGETING IS CONSENT-GATED AND NON-HEALTH ONLY. The attribute allowlist is
// enforced in the database (public.ad_targeting_attributes + a foreign key from
// the campaign targeting table), so nothing can be targeted that isn't listed
// there. This module only humanises those codes for the UI.
//
// PERMANENTLY BANNED as targeting inputs — do not add, do not "derive":
//   blood markers or panels, medications, diagnosed conditions, scalp
//   conditions, medical history, hair loss / thinning areas, style tension,
//   pregnancy, age, ethnicity/heritage, postcode, journal or voicenote content,
//   professional relationships, chat content.

/** Order attributes are presented in the campaign designer. */
export const ATTRIBUTE_ORDER = [
  "porosity",
  "density",
  "diameter",
  "texture",
  "length",
  "wash_freq",
  "product_category",
  "current_style",
  "planned_style",
  "goal_focus",
] as const;

export type TargetingAttributeKey = (typeof ATTRIBUTE_ORDER)[number];

export interface TargetingOption {
  attribute_key: string;
  value_code: string;
  label: string;
  attribute_label: string;
  sort_order: number;
}

/** Selected rules: { attribute_key: [value_code, ...] }. Within an attribute the
 *  values are OR'd; across attributes they are AND'd. */
export type TargetingRules = Record<string, string[]>;

export const rulesAreEmpty = (rules: TargetingRules): boolean =>
  Object.values(rules).every((v) => !v || v.length === 0);

export const cleanRules = (rules: TargetingRules): TargetingRules => {
  const out: TargetingRules = {};
  for (const [k, v] of Object.entries(rules)) {
    const vals = (v ?? []).filter(Boolean);
    if (vals.length > 0) out[k] = [...new Set(vals)].sort();
  }
  return out;
};

/* The per-advert "Why am I seeing this?" explainer was removed from the
 * sponsored banner, so the member-facing reason-code phrasing (`explainMatch`
 * and its REASON_PREFIX map) went with it. Stored `match_reason` codes are still
 * logged on ad_events for reporting; they are simply no longer rendered to
 * members. Members understand and withdraw targeting through the
 * `personalised_offers` consent and the Personalised offers page. */


/* No presets, bundles or suggested audiences — every allowlisted value is
 * selected individually by the brand. Do not reintroduce grouping controls
 * beyond a per-attribute "select all" inside that attribute's own list. */



/* ── Approximate member-count bands ───────────────────────────────────────────
 * Brands never see exact member counts — they see an approximate range derived
 * from the real number. Zero is always explicit and actionable (never dressed up
 * as a band) so a brand knows their targeting is too narrow. Admins are shown
 * exact figures and must not use these helpers.
 *
 *   0        → "No members match yet"
 *   1–9      → "Fewer than 10"
 *   10–49    → nearest 10 band  (23 → "20–30")
 *   50–199   → nearest 50 band  (78 → "50–100")
 *   200+     → nearest 100 band (340 → "300–400")
 */
export const NO_MEMBERS_LABEL = "No members match yet";

/** Prompt shown alongside a zero count. */
export const WIDEN_AUDIENCE_PROMPT =
  "Nothing matches this combination yet — remove a filter or add more values to widen your audience.";

export function bandMemberCount(count: number | null | undefined): string {
  if (count == null || Number.isNaN(count)) return "—";
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return NO_MEMBERS_LABEL;
  if (n < 10) return "Fewer than 10";
  const step = n < 50 ? 10 : n < 200 ? 50 : 100;
  const low = Math.floor(n / step) * step;
  return `${low}–${low + step}`;
}

export const isZeroCount = (count: number | null | undefined): boolean => count === 0;


/** Plain-words description of the current selection, for the state line. */
export function describeAudience(
  rules: TargetingRules,
  options: TargetingOption[] | undefined,
): string {
  const clean = cleanRules(rules);
  if (rulesAreEmpty(clean)) return "Showing to everyone. Narrow it below.";
  const parts: string[] = [];
  for (const key of ATTRIBUTE_ORDER) {
    const codes = clean[key];
    if (!codes || codes.length === 0) continue;
    const group = (options ?? []).filter((o) => o.attribute_key === key);
    const labels = codes
      .map((c) => group.find((o) => o.value_code === c)?.label ?? c)
      .map((l) => l.replace(/^(Goal|Uses|Washes)\s*:?\s*/i, "").trim() || l);
    const attributeLabel = (group[0]?.attribute_label ?? key).toLowerCase();
    if (labels.length === 0) continue;
    if (group.length > 0 && labels.length === group.length) {
      parts.push(`any ${attributeLabel}`);
    } else if (labels.length <= 3) {
      parts.push(`${attributeLabel}: ${labels.join(", ")}`);
    } else {
      parts.push(`${labels.length} ${attributeLabel} options`);
    }
  }
  if (parts.length === 0) return "Showing to everyone. Narrow it below.";
  return `Showing to members with ${parts.join("; ")}.`;
}
