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

/** Short member-facing phrasing for each attribute, used in the
 *  "Why am I seeing this?" line. Never clinical, never health. */
const REASON_PREFIX: Record<string, string> = {
  porosity: "your porosity",
  density: "your density",
  diameter: "your strand thickness",
  texture: "your hair's surface texture",
  length: "your hair length",
  wash_freq: "how often you wash",
  product_category: "the kinds of products on your shelf",
  current_style: "your current style",
  planned_style: "your planned next style",
  goal_focus: "your hair goal",
};

/** Turn stored reason codes ("porosity_high") into a member-facing sentence,
 *  using the vocabulary rows so labels always match what brands picked. */
export function explainMatch(
  reasons: string[] | null | undefined,
  options: TargetingOption[] | undefined,
): string | null {
  if (!reasons || reasons.length === 0) return null;
  const parts: string[] = [];
  for (const code of reasons) {
    const hit = (options ?? []).find((o) => `${o.attribute_key}_${o.value_code}` === code);
    if (!hit) continue;
    const prefix = REASON_PREFIX[hit.attribute_key];
    if (!prefix) continue;
    parts.push(`${prefix} (${hit.label.replace(/^(Goal|Uses|Washes)\s*:?\s*/i, "").trim() || hit.label})`);
  }
  if (parts.length === 0) return null;
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `This brand asked to reach members based on ${list}. Nothing about your health, blood work or medications is ever used.`;
}

/* No presets, bundles or suggested audiences — every allowlisted value is
 * selected individually by the brand. Do not reintroduce grouping controls
 * beyond a per-attribute "select all" inside that attribute's own list. */



/** Milestone at which audience numbers start being reported. Reporting-only —
 *  a campaign can run below it. */
export const REACH_REPORTING_MILESTONE = 50;

/** Plain-words description of the current selection, for the state line. */
export function describeAudience(
  rules: TargetingRules,
  options: TargetingOption[] | undefined,
): string {
  const clean = cleanRules(rules);
  if (rulesAreEmpty(clean)) return "Showing to everyone. Tap below to narrow it.";
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
  if (parts.length === 0) return "Showing to everyone. Tap below to narrow it.";
  return `Showing to members with ${parts.join("; ")}.`;
}
