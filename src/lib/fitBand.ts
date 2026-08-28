// CLIENT MIRROR OF supabase/functions/_shared/fit-band.ts
// ======================================================
// The verdict label a member reads is derived from the score via
// `verdictForStars`. AI prose that calls the same product "a mixed fit" while
// the label above it says "Good fit for your routine" is a contradiction the
// member has no way to resolve — so any overall-fit wording in the summary is
// rewritten to the phrase for the band the score actually falls in.
//
// The server does this at generation time; this is the belt-and-braces pass for
// payloads generated before the rule existed (cached rows, saved shelf copy).
// The score and the label are never changed here — only the words.

import { starsFromScore } from "./matchStars";

export type FitBand = "excellent" | "good" | "mixed" | "poor" | "avoid";

export function fitBandForScore(score: unknown): FitBand | null {
  const stars = starsFromScore(score);
  if (stars == null) return null;
  if (stars >= 4.5) return "excellent";
  if (stars >= 3.5) return "good";
  if (stars >= 2.5) return "mixed";
  if (stars >= 1.5) return "poor";
  return "avoid";
}

const BAND_PHRASE: Record<FitBand, string> = {
  excellent: "a strong fit",
  good: "a good fit",
  mixed: "a mixed fit",
  poor: "not an ideal fit",
  avoid: "a poor fit",
};

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

/** Rewrites contradictory fit wording to the band's own phrase. */
export function alignFitLanguage(text: string | null | undefined, score: unknown): string {
  const source = typeof text === "string" ? text : "";
  if (!source.trim()) return source;
  const band = fitBandForScore(score);
  if (!band) return source;
  let out = source;
  for (const { re, bands } of PHRASE_BANDS) {
    if (bands.includes(band)) continue;
    out = out.replace(re, BAND_PHRASE[band]);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}
