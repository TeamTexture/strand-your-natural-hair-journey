// procedural-rag — retrieval biased toward PROCEDURE rather than theme.
//
// WHY THIS EXISTS
// The tip surfaces were producing tautologies ("protecting your hair prevents
// damage to your hair") because retrieval was returning passages *about* a
// theme (moisture, porosity, protective styling) rather than passages that
// describe a PROCEDURE: a named treatment, a sequence, a timing, a frequency.
// A model cannot invent a method it was never given, so the fix belongs in
// retrieval first and validation second.
//
// WHAT IT DOES
//  1. Appends a procedural-intent phrase to the semantic query, so the query
//     vector sits nearer passages written as instructions.
//  2. Over-fetches candidates and RE-RANKS them by a procedural-density score
//     (imperative verbs, sequence markers, timings, frequencies, quantities,
//     named interventions) blended with the cosine similarity.
//  3. Guarantees that, when the corpus has them, at least two of the returned
//     passages clear the procedural bar — so every tip prompt contains at
//     least some method to draw from.
//
// Nothing here weakens grounding: only the ORDER and SELECTION of manuscript
// passages changes. Every claim still has to come from `manuscript_chunks`.

import { retrievePassages, type Passage } from "./rag.ts";

/** Appended to every tip retrieval query. Pushes the query vector toward
 *  instructional passages: steps, sequences, timings, frequencies, treatments. */
export const PROCEDURAL_INTENT =
  "step by step method, what to do and when to do it, the sequence, before installing, after taking down, overnight, how long to leave it, how often, frequency, treatment, technique, applying, rinsing, sectioning, timing";

/** Pattern groups that mark a passage as procedural rather than thematic. */
const PROCEDURAL_PATTERNS: Array<{ re: RegExp; weight: number }> = [
  // Sequence / ordering
  { re: /\b(step|steps|first|firstly|next|then|finally|afterwards?|start by|begin by|follow(?:ed)? by|once you(?:'ve| have))\b/gi, weight: 1 },
  // Timing
  { re: /\b(before|after|overnight|the night before|immediately|straight away|while (?:it'?s|still) (?:damp|wet)|on (?:damp|wet|dry) hair|take[- ]?down|install(?:ing|ation)?|mid[- ]week)\b/gi, weight: 1.4 },
  // Duration / frequency
  { re: /\b(\d+\s*(?:–|-|to)?\s*\d*\s*(?:minutes?|mins?|hours?|days?|weeks?|months?)|every\s+\d+|once a (?:week|month|fortnight)|twice a (?:week|month)|weekly|fortnightly|monthly|each wash day)\b/gi, weight: 1.4 },
  // Instructing verbs
  { re: /\b(apply|applying|rinse|rinsing|cleanse|shampoo|condition|detangle|section|part|clip|smooth|seal|saturate|soak|dampen|spritz|mist|massage|comb|tuck|wrap|braid|band|stretch|blot|squeeze|wipe|swipe|dab|trim|cover|steam|warm)\b/gi, weight: 1 },
  // Named interventions / kit
  { re: /\b(treatment|mask|deep condition(?:ing|er)?|pre[- ]?poo|protein treatment|clarify(?:ing)?|leave[- ]in|conditioner|cleanser|cotton pad|serum|bonnet|satin|silk|heat|steam(?:er)?|wide[- ]tooth comb|spray bottle)\b/gi, weight: 1.2 },
  // Quantity / manner specifics
  { re: /\b(small amount|thin layer|palmful|pea[- ]sized|generous|sparingly|gently|firmly|row by row|section by section|in four|quadrants?)\b/gi, weight: 1 },
];

/**
 * 0..1 procedural density for a passage body. Saturating: a passage needs
 * several distinct procedural signals to approach 1.
 */
export function proceduralScore(text: string): number {
  const body = text ?? "";
  if (!body.trim()) return 0;
  let raw = 0;
  for (const { re, weight } of PROCEDURAL_PATTERNS) {
    const hits = body.match(re)?.length ?? 0;
    if (hits > 0) raw += weight * Math.min(3, hits);
  }
  // ~8 weighted hits is a thoroughly procedural passage.
  return Math.min(1, raw / 8);
}

/** A passage at or above this score contains real method, not just theme. */
export const PROCEDURAL_BAR = 0.34;

export interface ProceduralRetrievalResult {
  passages: Passage[];
  /** Candidates considered, for logging. */
  considered: number;
  /** How many returned passages clear PROCEDURAL_BAR. */
  procedural: number;
}

/**
 * Retrieve `k` passages, biased toward procedure.
 *
 * Blend: 0.6 × cosine similarity + 0.4 × procedural density. Then, if fewer
 * than two of the winners clear the procedural bar, swap in the highest-scoring
 * procedural candidates that were left behind.
 */
export async function retrieveProceduralPassages(
  query: string,
  k = 5,
  chapterFilter?: number[],
): Promise<ProceduralRetrievalResult> {
  const wanted = Math.max(1, Math.min(k, 10));
  const biasedQuery = `${query} — ${PROCEDURAL_INTENT}`;

  let candidates = await retrievePassages(biasedQuery, 10, chapterFilter);
  if (candidates.length === 0 && chapterFilter && chapterFilter.length > 0) {
    candidates = await retrievePassages(biasedQuery, 10);
  }
  if (candidates.length === 0) {
    return { passages: [], considered: 0, procedural: 0 };
  }

  const scored = candidates.map((p) => {
    const proc = proceduralScore(p.body);
    return { p, proc, blended: p.similarity * 0.6 + proc * 0.4 };
  });
  scored.sort((a, b) => b.blended - a.blended);

  const chosen = scored.slice(0, wanted);
  const rest = scored.slice(wanted);
  const minProcedural = Math.min(2, wanted);
  let proceduralCount = chosen.filter((c) => c.proc >= PROCEDURAL_BAR).length;
  if (proceduralCount < minProcedural) {
    const spare = rest
      .filter((c) => c.proc >= PROCEDURAL_BAR)
      .sort((a, b) => b.proc - a.proc);
    // Replace the weakest non-procedural winners with real procedural passages.
    for (const swap of spare) {
      if (proceduralCount >= minProcedural) break;
      const idx = chosen.reduce(
        (worst, c, i) =>
          c.proc < PROCEDURAL_BAR && (worst < 0 || c.proc < chosen[worst].proc) ? i : worst,
        -1,
      );
      if (idx < 0) break;
      chosen[idx] = swap;
      proceduralCount++;
    }
  }

  return {
    passages: chosen.map((c) => c.p),
    considered: candidates.length,
    procedural: chosen.filter((c) => c.proc >= PROCEDURAL_BAR).length,
  };
}

/**
 * The prompt rule that turns those procedural passages into method-bearing
 * copy. Appended to every tip surface's system prompt.
 */
export const METHOD_AND_TIMING_RULE = `METHOD RULE — NON-NEGOTIABLE, EVERY TIP:
1. NAME A METHOD. Every tip must name a specific intervention drawn from the retrieved manuscript passages: a treatment, a technique, a step, a sequence, a product TYPE, a tool, a frequency or a duration. An outcome is not a tip. A goal is not a tip. A principle is not a tip.
2. GIVE THE TIMING. Where the passages support it, say WHEN: before installing the style, after taking it down, the night before, immediately after rinsing, mid-week, on damp hair. Timing is usually the most useful part of a tip — include it whenever the manuscript supports one.
3. NO TAUTOLOGY. Never justify a tip by restating its own goal. "Protecting your hair prevents damage" and "keeping moisture in stops moisture loss" are circular and are rejected. The justification must describe a MECHANISM or a CONSEQUENCE that the passages actually state.
4. NO OUTCOME-ONLY LANGUAGE AS THE SUBSTANCE. "Maintain", "protect", "look after", "keep", "prioritise", "focus on", "be consistent with", "stay on top of" may appear in a headline, but the body must convert them into something she physically does.
5. If the retrieved passages do not support a method for the obvious topic, pick a DIFFERENT tip that they DO support. Never invent a method, a timing or a mechanism that is not in the passages.`;
