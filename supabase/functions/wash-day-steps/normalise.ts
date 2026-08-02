// Pure output-shaping helpers for wash-day-steps. Kept out of index.ts so the
// caps and step budget can be unit-tested without the Deno serve entrypoint.

export const STEP_BUDGET: Record<number, { min: number; max: number; note: string }> = {
  1: { min: 4, max: 5, note: "ONLY the essential steps — the wash cannot work without them." },
  2: { min: 6, max: 8, note: "The core sequence, still trimmed of optional refinements." },
  3: { min: 8, max: 12, note: "The full sequence." },
  4: {
    min: 8,
    max: 16,
    note:
      "The full sequence, plus sub-steps WHERE THE PASSAGES TEACH THEM (e.g. how to section, how to detangle). Never invent a sub-step to reach a count.",
  },
};

export interface WashStep {
  n: number;
  headline: string;
  body: string;
  why?: string;
  icon_hint?: string;
  product_ref?: string;
}

/** Trim a free-text field to a word cap without cutting mid-word. */
export function capWords(text: string, max: number): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  const words = clean.split(" ").filter(Boolean);
  if (words.length <= max) return clean;
  return words.slice(0, max).join(" ").replace(/[,;:—-]+$/, "");
}

/** Enforce caps, ONE IDEA ONCE, renumbering and the level step budget. */
export function normaliseSteps(raw: unknown, level: number): WashStep[] {
  const budget = STEP_BUDGET[level] ?? STEP_BUDGET[3];
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const steps: WashStep[] = [];
  for (const item of raw) {
    const o = (item ?? {}) as Record<string, unknown>;
    const headline = capWords(String(o.headline ?? ""), 8);
    const body = capWords(String(o.body ?? ""), 30);
    if (!headline || !body) continue;
    const key = headline.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const why = o.why ? capWords(String(o.why), 15) : "";
    steps.push({
      n: steps.length + 1,
      headline,
      body,
      ...(why ? { why } : {}),
      ...(o.icon_hint ? { icon_hint: String(o.icon_hint).slice(0, 40) } : {}),
      ...(o.product_ref ? { product_ref: String(o.product_ref).slice(0, 80) } : {}),
    });
    if (steps.length >= budget.max) break;
  }
  return steps;
}
