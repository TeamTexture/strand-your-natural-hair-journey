// ONE FIT BAND FOR THE SCORE, THE LABEL AND THE PROSE
// ===================================================
// 2026-08-28. A card showed the verdict label "Good fit for your routine"
// (derived from 72 → 3.5 stars) directly above AI prose calling the same
// product "a mixed fit". Same class of bug as the 4 Aug star/label drift: two
// independent judgements of one number.
//
// The band below mirrors `src/lib/matchStars.ts` `verdictForStars` exactly —
// the score→stars maths in that file is untouched, this only names the band the
// score falls into so the model's fit language can be constrained to it and
// deterministically corrected when it is not.

export type FitBand = "excellent" | "good" | "mixed" | "poor" | "avoid";

/** Same thresholds as verdictForStars(starsFromScore(score)) in matchStars.ts. */
export function fitBandForScore(score: number | null | undefined): FitBand | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const stars = Math.max(0.5, Math.min(5, Math.round((s / 20) * 2) / 2));
  if (stars >= 4.5) return "excellent";
  if (stars >= 3.5) return "good";
  if (stars >= 2.5) return "mixed";
  if (stars >= 1.5) return "poor";
  return "avoid";
}

/** The words the summary is allowed to use for each band. */
const BAND_PHRASE: Record<FitBand, string> = {
  excellent: "a strong fit",
  good: "a good fit",
  mixed: "a mixed fit",
  poor: "not an ideal fit",
  avoid: "a poor fit",
};

/** Fit phrases the model actually writes, mapped to the band they assert. */
const PHRASE_BANDS: Array<{ re: RegExp; bands: FitBand[] }> = [
  { re: /\b(?:an?\s+)?excellent (?:fit|match)\b/gi, bands: ["excellent"] },
  { re: /\b(?:an?\s+)?strong (?:fit|match)\b/gi, bands: ["excellent", "good"] },
  { re: /\b(?:an?\s+)?good (?:fit|match)\b/gi, bands: ["excellent", "good"] },
  { re: /\b(?:an?\s+)?solid (?:fit|match)\b/gi, bands: ["excellent", "good"] },
  { re: /\b(?:an?\s+)?mixed (?:fit|match|bag)\b/gi, bands: ["mixed"] },
  { re: /\b(?:an?\s+)?partial (?:fit|match)\b/gi, bands: ["mixed"] },
  { re: /\b(?:an?\s+)?poor (?:fit|match)\b/gi, bands: ["poor", "avoid"] },
  { re: /\b(?:an?\s+)?weak (?:fit|match)\b/gi, bands: ["poor", "avoid"] },
  { re: /\bnot (?:an?\s+)?(?:ideal|great|good) (?:fit|match)\b/gi, bands: ["mixed", "poor", "avoid"] },
];

/** Prompt block: the model is told which words the band permits. */
export function fitLanguageBlock(score: number | null | undefined): string {
  const band = fitBandForScore(score);
  if (!band) {
    return `
OVERALL FIT LANGUAGE:
Do not describe the product's overall fit in words ("good fit", "mixed fit", "poor fit") unless you are also returning a match_score. The label the member reads is derived from the score, and prose that disagrees with it reads as a contradiction.`;
  }
  return `
OVERALL FIT LANGUAGE — MUST MATCH THE SCORE BAND:
The member sees a verdict label derived from match_score. Bands: 90+ "a strong fit", 70-89 "a good fit", 50-69 "a mixed fit", 30-49 "not an ideal fit", under 30 "a poor fit".
Whatever score you return, any overall-fit wording in ai_summary must be the phrase for THAT band — "${BAND_PHRASE[band]}" for a score like the one you are considering. Never call a product a mixed fit while scoring it in the good band, or a good fit while scoring it low. If the honest verdict is mixed, return a mixed-band score.`;
}

/**
 * Deterministic correction. A fit phrase that contradicts the band the score
 * actually falls into is rewritten to the band's own phrase; the rest of the
 * sentence, and the score, are untouched.
 */
export function alignFitLanguage(text: unknown, score: number | null | undefined): string {
  if (typeof text !== "string" || !text.trim()) return typeof text === "string" ? text : "";
  const band = fitBandForScore(score);
  if (!band) return text;
  let out = text;
  for (const { re, bands } of PHRASE_BANDS) {
    if (bands.includes(band)) continue;
    out = out.replace(re, BAND_PHRASE[band]);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}
