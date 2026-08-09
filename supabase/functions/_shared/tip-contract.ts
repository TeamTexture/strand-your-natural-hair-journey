// THE SHARED TIP CONTRACT — one schema, one hard/soft split, one graded
// fallback, for every guidance surface in the app.
//
// Structural only: this module contains NO hair care copy. It defines the
// shape a tip must have, which rules may block, which are merely logged, and
// how a degraded generation is served (or withheld).
//
// Fields — the same for every surface, nothing else:
//   headline  short, states the subject
//   action    REQUIRED. A specific instruction the member carries out
//   reason    REQUIRED. Why it matters — mechanism or consequence
//   extended  OPTIONAL. Fuller personalised context, hand-holding only

import { validateTipAction, validateTipReason, memberAttributeTokens } from "./tip-action.ts";
import { validateTipMethod, validateTipTautology } from "./tip-method.ts";
import { detectCompoundTip, primaryFacet } from "./tip-set-integrity.ts";
import { capsForLevel, sentenceCount, type TipLevel } from "./tip-level-caps.ts";

export interface ContractTip {
  headline?: string | null;
  action?: string | null;
  reason?: string | null;
  extended?: string | null;
}

/** The only four fields any surface may generate. */
export const CONTRACT_FIELDS = ["headline", "action", "reason", "extended"] as const;

/** HARD rules — these and only these may block a generation. */
export const HARD_RULES = [
  "action_present",
  "reason_present",
  "grounded",
  "no_brand_names",
] as const;

/** SOFT rules — recorded, fed into ONE retry, never prevent serving. */
export const SOFT_RULES = [
  "tautology",
  "no_method",
  "no_timing",
  "generic_goal",
  "not_personalised",
  "compound_tip",
  "cross_tip_contradiction",
  "over_word_cap",
] as const;

export type HardRule = (typeof HARD_RULES)[number];
export type SoftRule = (typeof SOFT_RULES)[number];

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Structural field spec for prompts. Describes the SHAPE only — every surface
 * appends its own subject matter and grounding rules.
 */
export const TIP_CONTRACT_FIELD_SPEC = `OUTPUT CONTRACT — these four fields, nothing else:
- "headline": short, names the subject. No emoji, no colon-prefixed label.
- "action": REQUIRED. One specific instruction the member carries out, opening with an instruction verb. Never empty. Never a restatement of the headline.
- "reason": REQUIRED. Why it matters for her — the mechanism or the consequence of skipping it. It explains the action, it never repeats it. Never empty.
- "extended": OPTIONAL. Fuller personalised context. Omit the field entirely when there is nothing further to say.

Do not output any other field: no "body", no "technique", no "next_time", no "key_fact", no arrays.
A field you cannot fill honestly is omitted — never padded, and never left as an empty string.`;

/** JSON shape fragment for a single tip, for response_format schemas. */
export const tipJsonSchema = (extended = true) => ({
  type: "object",
  properties: {
    headline: { type: "string" },
    action: { type: "string" },
    reason: { type: "string" },
    ...(extended ? { extended: { type: "string" } } : {}),
  },
  required: ["headline", "action", "reason"],
  additionalProperties: false,
});

/** JSON shape for a list of contract tips (routine tips, goal steps, …). */
export const tipListJsonSchema = (key: string, minItems = 1, maxItems = 3) => ({
  type: "object",
  properties: {
    [key]: { type: "array", minItems, maxItems, items: tipJsonSchema() },
  },
  required: [key],
  additionalProperties: false,
});

// ---------------------------------------------------------------------------
// HARD validation — the only blocking rules
// ---------------------------------------------------------------------------

export interface HardOptions {
  /** False when grounding/traceability rejected the claim. */
  grounded?: boolean;
  /** Brand or product names this surface forbids. */
  forbiddenNames?: string[];
}

export function validateTipHard(tip: ContractTip, opts: HardOptions = {}): HardRule[] {
  const failures: HardRule[] = [];
  if (!txt(tip.action)) failures.push("action_present");
  if (!txt(tip.reason)) failures.push("reason_present");
  if (opts.grounded === false) failures.push("grounded");
  const names = (opts.forbiddenNames ?? []).map((n) => n.trim()).filter((n) => n.length > 2);
  if (names.length) {
    const blob = [tip.headline, tip.action, tip.reason, tip.extended].filter(Boolean).join(" ").toLowerCase();
    if (names.some((n) => blob.includes(n.toLowerCase()))) failures.push("no_brand_names");
  }
  return failures;
}

// ---------------------------------------------------------------------------
// SOFT validation — logged, one retry, never blocks
// ---------------------------------------------------------------------------

export interface SoftOptions {
  level?: unknown;
  /** Humanised profile tokens, for the personalisation signal. */
  context?: Record<string, unknown>;
  attributeTokens?: string[];
  /** Sibling tips in the same set, for contradiction detection. */
  siblings?: ContractTip[];
  /** Goal labels the member actually recorded, verbatim. */
  goalLabels?: string[];
}

const GENERIC_GOAL = /\b(your (hair )?goals?|her goals?|the goal|your objectives?|your aims?)\b/i;

export function validateTipSoft(tip: ContractTip, opts: SoftOptions = {}): SoftRule[] {
  const soft = new Set<SoftRule>();
  const action = txt(tip.action);
  const reason = txt(tip.reason);
  if (!action && !reason) return [];

  const tokens =
    opts.attributeTokens ??
    memberAttributeTokens((opts.context ?? {}) as Parameters<typeof memberAttributeTokens>[0]);

  try {
    const a = validateTipAction({ action, headline: txt(tip.headline), attributeTokens: tokens });
    for (const r of a.reasons ?? []) if (r !== "missing_action") soft.add(mapSoft(r));
  } catch { /* soft rules never break a request */ }

  try {
    const r = validateTipReason({ reason, action, attributeTokens: tokens });
    for (const reasonCode of r.reasons ?? []) if (reasonCode !== "missing_reason") soft.add(mapSoft(reasonCode));
  } catch { /* ignore */ }

  try {
    const m = validateTipMethod({ tip: action });
    for (const code of m.reasons ?? []) soft.add(mapSoft(code));
  } catch { /* ignore */ }

  try {
    const t = validateTipTautology({ tip: `${action} ${reason}` });
    if (!t.ok) soft.add("tautology");
  } catch { /* ignore */ }

  if (detectCompoundTip(action).compound) soft.add("compound_tip");

  // Generic goal reference — only the member's own recorded label is allowed.
  const blob = `${action} ${reason}`;
  const labels = (opts.goalLabels ?? []).map((l) => l.toLowerCase()).filter(Boolean);
  if (GENERIC_GOAL.test(blob) && !labels.some((l) => blob.toLowerCase().includes(l))) {
    soft.add("generic_goal");
  }

  // Cross-tip contradiction — two tips prescribing the same task differently.
  const facet = primaryFacet(action);
  if (facet) {
    for (const sib of opts.siblings ?? []) {
      const sibAction = txt(sib.action);
      if (!sibAction || sibAction === action) continue;
      if (primaryFacet(sibAction) === facet) soft.add("cross_tip_contradiction");
    }
  }

  // Word caps are display guidance now — over-length is soft only.
  const caps = capsForLevel(opts.level);
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  if (caps.action && words(action) > caps.action.words) soft.add("over_word_cap");
  if (caps.reason && words(reason) > caps.reason.words) soft.add("over_word_cap");

  return [...soft];
}

const mapSoft = (code: string): SoftRule => {
  if (code.includes("tauto") || code.includes("restate")) return "tautology";
  if (code.includes("timing") || code.includes("frequency")) return "no_timing";
  if (code.includes("method") || code.includes("outcome_only")) return "no_method";
  if (code.includes("generic")) return "generic_goal";
  if (code.includes("personal")) return "not_personalised";
  if (code.includes("compound")) return "compound_tip";
  return "no_method";
};

/** Feed the specific failures back into a SINGLE retry. */
export function contractRetryDirective(hard: HardRule[], soft: SoftRule[]): string {
  const lines: string[] = [];
  if (hard.includes("action_present")) lines.push('- "action" was empty. Give one specific instruction she carries out, opening with an instruction verb.');
  if (hard.includes("reason_present")) lines.push('- "reason" was empty. Explain why the action matters for her — the mechanism or the consequence.');
  if (hard.includes("grounded")) lines.push("- A claim was not traceable to the retrieved passages. Rewrite using only what the passages state. Never fall back on general industry knowledge.");
  if (hard.includes("no_brand_names")) lines.push("- A brand or product name appeared. Use product types and tools only.");
  if (soft.includes("tautology")) lines.push('- The "reason" restated the "action". Give the mechanism instead.');
  if (soft.includes("no_method")) lines.push("- The action named an outcome, not a method. State what she physically does.");
  if (soft.includes("no_timing")) lines.push("- Add the frequency or timing where the passages support one.");
  if (soft.includes("generic_goal")) lines.push("- A generic goal reference appeared. Use her recorded goal label verbatim, or leave it out.");
  if (soft.includes("not_personalised")) lines.push("- Name a real characteristic from her profile.");
  if (soft.includes("compound_tip")) lines.push("- Two ideas in one tip. Keep one idea only.");
  if (soft.includes("cross_tip_contradiction")) lines.push("- Two tips prescribed the same task differently. Keep one method per task.");
  if (soft.includes("over_word_cap")) lines.push("- Tighten the wording.");
  if (!lines.length) return "";
  return `REVISION REQUIRED — fix exactly these and change nothing else:\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Graded fallback — never nothing, never a bare headline
// ---------------------------------------------------------------------------

/** A tip may only render its normal layout when BOTH action and reason exist. */
export const isRenderableTip = (tip: ContractTip | null | undefined): boolean =>
  !!tip && !!txt(tip.action) && !!txt(tip.reason);

/**
 * Step 4.4 — serve the best candidate that has both an action and a reason,
 * even if imperfect. Returns null only when no candidate qualifies, in which
 * case the surface must withhold the card entirely (Step 4.5).
 */
export function pickBestCandidate(
  candidates: Array<{ tip: ContractTip; hard: HardRule[]; soft: SoftRule[] }>,
): { tip: ContractTip; hard: HardRule[]; soft: SoftRule[] } | null {
  const usable = candidates.filter((c) => isRenderableTip(c.tip));
  if (!usable.length) return null;
  return usable.sort(
    (a, b) => a.hard.length - b.hard.length || a.soft.length - b.soft.length,
  )[0];
}

/**
 * Guard against post-generation stripping (fidelity, sanitisers) blanking a
 * required field. If action or reason survived generation but was emptied
 * afterwards, that is a hard failure — not a servable tip.
 */
export function protectRequiredFields(
  before: ContractTip,
  after: ContractTip,
): { tip: ContractTip; blanked: Array<"action" | "reason"> } {
  const blanked: Array<"action" | "reason"> = [];
  for (const f of ["action", "reason"] as const) {
    if (txt(before[f]) && !txt(after[f])) blanked.push(f);
  }
  return { tip: after, blanked };
}

// ---------------------------------------------------------------------------
// Levels are PRESENTATION only (Step 5)
// ---------------------------------------------------------------------------

const firstSentence = (s: string): string => {
  const t = txt(s);
  if (!t) return t;
  if (sentenceCount(t) <= 1) return t;
  const m = t.match(/^[^.!?]*[.!?]/);
  return (m?.[0] ?? t).trim();
};

/**
 * Generation is always full detail. The level decides what is displayed:
 *  1 Minimal      headline + action + reason, one sentence each
 *  2 Essential    headline + action + reason at full length
 *  3 Hand-holding everything, plus extended
 * Every level always shows an action and a reason.
 */
export function displayForLevel(tip: ContractTip, level: unknown): ContractTip {
  const lvl = (Number(level) === 1 ? 1 : Number(level) === 3 ? 3 : 2) as TipLevel;
  if (lvl === 1) {
    return {
      headline: txt(tip.headline),
      action: firstSentence(tip.action ?? ""),
      reason: firstSentence(tip.reason ?? ""),
    };
  }
  if (lvl === 2) {
    return { headline: txt(tip.headline), action: txt(tip.action), reason: txt(tip.reason) };
  }
  return {
    headline: txt(tip.headline),
    action: txt(tip.action),
    reason: txt(tip.reason),
    extended: txt(tip.extended) || undefined,
  };
}
