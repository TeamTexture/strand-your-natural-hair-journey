// tip-level-caps — the per-level word budgets for a generated tip, and the
// validator that ENFORCES them.
//
// Three support levels only (see _shared/tips-level.ts):
//   1 minimal      — headline + action + reason. Nothing else.
//   2 essential    — headline + action + reason + technique. No extended `why`.
//   3 hand-holding — everything: action, reason, extended `why`, technique,
//                    next_time. No caps beyond the global output budgets.
//
// DEGRADATION ORDER — what gives way first as the level drops or as a field
// fails validation:
//   1. next_time      (dropped first)
//   2. extended why
//   3. technique
//   4. — nothing else. `action` and `reason` are present at EVERY level and are
//        NEVER the fields that degrade. A member told what to do without being
//        told why has learned nothing.
//
// EVERY LEVEL IS A WHOLE TIP. Minimal means briefer, not thinner: the action
// floor and the reason floor in _shared/tip-action.ts apply unchanged at every
// level, so a minimal tip is still a specific action plus a real, grounded,
// personalised why — expressed in two sentences.
//
// The caps below are validated against the model's output and trimmed on the
// way out; they are never merely requested in the prompt.


import { trimToCap, wordCount } from "./product-name-wall.ts";

export type TipLevel = 1 | 2 | 3;

export interface TipFieldCaps {
  /** Word cap for `action`. null = no cap beyond the global output budgets. */
  action: number | null;
  /** Word cap for `reason`. */
  reason: number | null;
  /** Word cap for `technique`; 0 = the field is not rendered at this level. */
  technique: number | null;
  /** Extended personalised `why` prose — hand-holding only. */
  extendedWhy: boolean;
  /** "Try this next wash day" — hand-holding only. */
  nextTime: boolean;
}

export const TIP_LEVEL_CAPS: Record<TipLevel, TipFieldCaps> = {
  // Minimal — two sentences that still teach.
  1: { action: 20, reason: 18, technique: 0, extendedWhy: false, nextTime: false },
  // Essential — adds the concrete how, and NOTHING else. The extended `why`
  // prose is the specific bloat this level must not carry.
  2: { action: 35, reason: 25, technique: 40, extendedWhy: false, nextTime: false },
  // Hand-holding — the full treatment.
  3: { action: null, reason: null, technique: null, extendedWhy: true, nextTime: true },
};

export const capsForLevel = (level: unknown): TipFieldCaps =>
  TIP_LEVEL_CAPS[(level === 1 || level === 2 || level === 3 ? level : 2) as TipLevel];

/** Sentence count, counting only terminated or trailing sentences. */
export const sentenceCount = (s: string) =>
  (s ?? "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter((p) => p.trim().length > 1).length;

/**
 * VALIDATION — machine-readable violations for the retry pass. Returns [] when
 * the output already fits the level. Applies at levels 1 and 2; hand-holding
 * has no per-field caps beyond the global budgets.
 */
export function levelCapViolations(
  level: unknown,
  input: { action: string; reason: string; technique?: string },
): string[] {
  const caps = capsForLevel(level);
  const out: string[] = [];
  if (caps.action != null && wordCount(input.action) > caps.action) out.push("action_over_level_cap");
  if (caps.reason != null && wordCount(input.reason) > caps.reason) out.push("reason_over_level_cap");
  if (sentenceCount(input.reason) > 1) out.push("reason_not_one_sentence");
  if (caps.action === 20 && sentenceCount(input.action) > 1) out.push("action_not_one_sentence");
  if (caps.action === 35 && sentenceCount(input.action) > 2) out.push("action_over_two_sentences");
  const technique = (input.technique ?? "").trim();
  if (caps.technique != null && caps.technique > 0 && technique && wordCount(technique) > caps.technique) {
    out.push("technique_over_level_cap");
  }
  return out;
}

/** Trim every field to the level's budget. A trimmed tip beats no tip. */
export function applyLevelCaps(
  level: unknown,
  input: { action: string; reason: string; technique: string; why: string; next_time: string },
): { action: string; reason: string; technique: string; why: string; next_time: string } {
  const caps = capsForLevel(level);
  const cap = (text: string, limit: number | null) =>
    limit == null ? (text ?? "").trim() : trimToCap(text ?? "", limit);
  return {
    action: cap(input.action, caps.action),
    reason: cap(input.reason, caps.reason),
    // Technique is dropped entirely at minimal, capped at essential.
    technique: caps.technique === 0 ? "" : cap(input.technique, caps.technique),
    // THE EXTENDED `why` IS HAND-HOLDING ONLY. Stripped server-side at the
    // other two levels so the duplication with `reason` cannot render.
    why: caps.extendedWhy ? (input.why ?? "").trim() : "",
    next_time: caps.nextTime ? (input.next_time ?? "").trim() : "",
  };
}

/** Prompt block stating the level's field roles and hard caps. Requested in
 *  the prompt AND validated above — the validation is what makes it real. */
export function tipLevelPromptBlock(level: unknown): string {
  const caps = capsForLevel(level);
  const lines = [
    "",
    "",
    "TIP FIELD ROLES AND HARD WORD CAPS FOR THIS MEMBER'S SUPPORT LEVEL — VALIDATED, NOT ADVISORY.",
    '- "action" and "reason" are required at EVERY level. "reason" is ALWAYS exactly ONE sentence, and it explains — it never restates the action.',
    '- There is NO "technique" field. Everything the member must physically do belongs in "action". Always return "technique" as an EMPTY STRING.',
  ];

  if (caps.action === 20) {
    lines.push(
      '- MINIMAL LEVEL. "action": ONE sentence, MAXIMUM 20 words. "reason": ONE sentence, MAXIMUM 18 words.',
      '- Return "why", "technique" and "next_time" as empty strings — nothing else is shown at this level.',
      "- Briefer is not thinner: the action stays a specific instruction, the reason stays a real grounded why, and both still name this member's own recorded detail. Cut words, never substance.",
    );
  } else if (caps.action === 35) {
    lines.push(
      '- ESSENTIAL LEVEL. "action": at most 2 sentences, MAXIMUM 35 words. "reason": ONE sentence, MAXIMUM 25 words. "technique": at most 2 sentences, MAXIMUM 40 words.',
      '- Return "why" and "next_time" as EMPTY STRINGS. The extended personalised prose is NOT shown at this level and duplicates "reason".',
      "- The tip must still be complete: a specific action, a real grounded why, and personalisation to their recorded state.",
    );
  } else {
    lines.push(
      '- HAND-HOLDING LEVEL. Return every field: "action", "reason", the extended "why" (2-3 sentences of personalised context tying the tip to their profile and their logged wash days), "technique" (the step-by-step how) and "next_time".',
      '- "why" must add NEW context — the fuller explanation against their own data. It must never simply restate "reason" in more words.',
    );
  }
  return lines.join("\n");
}
