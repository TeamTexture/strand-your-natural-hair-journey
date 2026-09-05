/**
 * Wash-day step vocabulary and heat helpers.
 *
 * IMPORTANT: `wash_days.steps[].name` stores the ORIGINAL step strings
 * ("Pre-poo", "Cleanse", "Co-wash", "Condition", "Treatment"). Historical rows
 * contain those exact strings and the AI insight generation matches on them, so
 * they must never change. Anything user-facing goes through `washStepLabel()`.
 */

/** Heat captured against a single wash step. */
export interface StepHeat {
  used: boolean;
  duration_min?: number;
  tool_ids?: string[];
  tools?: string[];
}

/** One entry of `wash_days.steps`. */
export interface WashStepEntry {
  name: string;
  product_id?: string;
  product_name?: string;
  /** Per-step heat. Absent on historical rows logged before per-step heat. */
  heat?: StepHeat | null;
}

/** Stored step name → display label. Display layer only. */
export const WASH_STEP_LABEL: Record<string, string> = {
  "Pre-poo": "Pre-poo",
  Cleanse: "Cleanse",
  "Co-wash": "Co-wash",
  Condition: "Condition",
  Treatment: "Treatment / Mask",
  "Leave-in": "Leave-in",
  Moisturise: "Moisturise",
  Style: "Style",
};

/** Human label for a stored step name, falling back to the stored string. */
export const washStepLabel = (name: string | null | undefined): string =>
  (name && WASH_STEP_LABEL[name]) || (name ?? "");

/**
 * Derive the log-level `heat_treatment` roll-up from per-step heat.
 *
 * The AI insight and next-wash-tip generation read `wash_days.heat_treatment`,
 * so per-step heat is always summarised back up on save: `used` when any step
 * used heat, `duration_min` as the total, tools/tool_ids as the union.
 * Returns null when no step recorded a heat answer at all.
 */
export const rollUpStepHeat = (
  steps: Array<{ heat?: StepHeat | null }>,
): StepHeat | null => {
  const answered = steps.map((s) => s.heat).filter((h): h is StepHeat => !!h);
  if (answered.length === 0) return null;
  const used = answered.filter((h) => h.used);
  if (used.length === 0) return { used: false };
  const totalMinutes = used.reduce((sum, h) => sum + (h.duration_min ?? 0), 0);
  const toolIds = Array.from(new Set(used.flatMap((h) => h.tool_ids ?? [])));
  const tools = Array.from(new Set(used.flatMap((h) => h.tools ?? [])));
  return {
    used: true,
    ...(totalMinutes > 0 ? { duration_min: totalMinutes } : {}),
    ...(toolIds.length ? { tool_ids: toolIds } : {}),
    ...(tools.length ? { tools } : {}),
  };
};

/** True when any step on this log recorded heat. */
export const anyStepUsedHeat = (steps: Array<{ heat?: StepHeat | null }>): boolean =>
  steps.some((s) => s.heat?.used === true);

/**
 * Cool-down guidance shown once per wash-day log whenever heat is recorded on
 * any step. Static UI copy — never persisted, and never written to
 * `next_wash_tip` (that column is AI-generated personalised guidance).
 */
export const HEAT_COOLDOWN_TIP =
  "Don't skip the cool-down. Heat lifts and swells the cuticle, so let your hair cool before you rinse, then smooth each section down through your fingers to help it close and seal the moisture in.";
