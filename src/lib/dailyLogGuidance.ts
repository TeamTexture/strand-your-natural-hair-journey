// LAYER 1 OF THE DAILY LOG GUIDANCE — A LOOKUP, NEVER A GENERATION.
//
// The daily log is the highest-frequency surface in the app. A model call on
// every save would repeat the CPU-limit failures already seen on the product
// scan, so the "why this works for you" line is ASSEMBLED HERE, synchronously,
// from data ALREADY STORED against the product (its analysis: `score_reasons`,
// `ai_summary`, `key_ingredients`) and her already-loaded hair characteristics.
//
// Rules this module holds:
//   • No network, no AI, no async. Pure functions only.
//   • No stored analysis for that product → return null. The confirmation then
//     renders WITHOUT the guidance block; we never generate one to fill a gap.
//   • CONFIRMATION, NOT VERDICT. Only "plus" drivers are used. Cautions,
//     build-up and scalp warnings belong to the WEEKLY card — never to a save.
//     A member logging a spritz is not asking to be marked.

import { parseScoreReasons, isFrequencyReason, type ScoreReason } from "@/components/product/ScoreReasons";

/** The stored, plaintext characteristics we may name back to her. */
export interface HairCharacteristics {
  porosity?: string | null;
  density?: string | null;
  diameter?: string | null;
  elasticity?: string | null;
  surface_texture?: string | null;
  areas_of_concern?: string[] | null;
}

/** The stored analysis fields this lookup reads. Nothing else is needed. */
export interface StoredProductAnalysis {
  match_score?: number | null;
  score_reasons?: unknown;
  ai_summary?: string | null;
  key_ingredients?: unknown;
}

export interface SaveGuidance {
  /** One or two sentences on why this product suits HER hair. */
  text: string;
  /** Which of her recorded characteristics the sentences lean on. */
  traits: string[];
}

/** Humanised label for a stored characteristic value ("high" → "high porosity"). */
const TRAIT_LABELS: Array<{ key: keyof HairCharacteristics; label: (v: string) => string }> = [
  { key: "porosity", label: (v) => `${v.toLowerCase()} porosity` },
  { key: "density", label: (v) => `${v.toLowerCase()} density` },
  { key: "diameter", label: (v) => `${v.toLowerCase()} strand diameter` },
  { key: "elasticity", label: (v) => `${v.toLowerCase()} elasticity` },
  { key: "surface_texture", label: (v) => v.toLowerCase() },
];

const clean = (v: unknown): string =>
  typeof v === "string" ? v.replace(/_/g, " ").trim() : "";

/** Her recorded characteristics as readable phrases, in a stable order. */
export function traitPhrases(hair: HairCharacteristics | null | undefined): string[] {
  if (!hair) return [];
  const out: string[] = [];
  for (const { key, label } of TRAIT_LABELS) {
    const raw = clean(hair[key]);
    if (raw && !/^(unknown|not sure|unsure)$/i.test(raw)) out.push(label(raw));
  }
  for (const area of hair.areas_of_concern ?? []) {
    const a = clean(area);
    if (a) out.push(a.toLowerCase());
  }
  return out;
}

/** A trait phrase is "named" when the stored reason already talks about it. */
const reasonNamesTrait = (reason: ScoreReason, phrase: string): boolean => {
  const head = phrase.split(" ")[0];
  if (!head || head.length < 4) return false;
  return new RegExp(`\\b${head.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(
    `${reason.factor} ${reason.reason}`,
  );
};

const tidySentence = (s: string): string => {
  const t = s.replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "");
  if (!t) return "";
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
};

/**
 * Assemble the "why this works for you" copy for a just-logged product.
 *
 * Returns null when the product carries no stored analysis — the caller then
 * shows the confirmation without a guidance block rather than generating one.
 */
export function buildSaveGuidance(
  product: StoredProductAnalysis | null | undefined,
  hair: HairCharacteristics | null | undefined,
): SaveGuidance | null {
  if (!product) return null;

  // Only the positive drivers. This is a confirmation surface: a stored
  // caution is never surfaced on a save (it belongs to the weekly card), and
  // neutral shelf-frequency observations are not reasons at all.
  const pluses = parseScoreReasons(product.score_reasons).filter(
    (r) => r.direction === "plus" && !isFrequencyReason(r),
  );

  const phrases = traitPhrases(hair);

  if (pluses.length > 0) {
    // Prefer a driver that already names one of her recorded characteristics,
    // so the sentence is about HER hair rather than about the bottle.
    const ranked = [...pluses].sort((a, b) => {
      const aNamed = phrases.some((p) => reasonNamesTrait(a, p)) ? 1 : 0;
      const bNamed = phrases.some((p) => reasonNamesTrait(b, p)) ? 1 : 0;
      return bNamed - aNamed;
    });
    const lead = ranked[0];
    const named = phrases.filter((p) => reasonNamesTrait(lead, p));
    const sentences = [tidySentence(lead.reason)];

    // A second sentence only when a DIFFERENT mechanism is on file, so the
    // block never restates itself to look fuller than the stored data is.
    const second = ranked
      .slice(1)
      .find((r) => r.factor.toLowerCase() !== lead.factor.toLowerCase());
    if (second) sentences.push(tidySentence(second.reason));

    const text = sentences.filter(Boolean).join(" ");
    if (!text) return null;
    return {
      text,
      traits: named.length ? named : phrases.slice(0, 2),
    };
  }

  // No stored drivers, but a stored summary exists — use its first sentence.
  const summary = clean(product.ai_summary);
  if (summary) {
    const first = summary.split(/(?<=[.!?])\s+/)[0] ?? "";
    const text = tidySentence(first);
    if (text) return { text, traits: phrases.slice(0, 2) };
  }

  return null;
}
