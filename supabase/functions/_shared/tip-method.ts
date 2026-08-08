// tip-method — the METHOD + ANTI-TAUTOLOGY floor for every AI tip surface.
//
// Two failures this module rejects:
//
//  1. NO METHOD. "Maintain moisture and protect the hair underneath your
//     cornrows" is an aspiration. A tip must name an intervention: a treatment,
//     a technique, a step, a product type, a tool, a timing, a frequency or a
//     duration.
//
//  2. TAUTOLOGY. "Protecting the hair underneath your cornrows prevents the
//     moisture loss that snaps your strands" restates the headline's goal as
//     its own benefit — zero information. Rejected structurally, not by asking
//     the model nicely.
//
// Pure string logic: no Deno APIs, no network. Imported by the edge functions
// AND unit-tested from the frontend Vitest suite.

/** Intention words. Allowed in a headline; never sufficient in a body. */
export const OUTCOME_ONLY = [
  "maintain", "maintaining", "protect", "protecting", "protection",
  "look after", "looking after", "keep", "keeping", "prioritise", "prioritize",
  "prioritising", "focus on", "focusing on", "be consistent", "consistency",
  "stay on top of", "care for", "caring for", "preserve", "preserving",
  "safeguard", "nurture", "nurturing", "ensure", "ensuring", "support",
  "supporting", "promote", "promoting", "boost", "boosting", "improve",
  "improving", "retain", "retaining",
];

/** A named intervention, tool or product TYPE. */
const INTERVENTION =
  /\b(treatment|mask|deep[- ]condition(?:ing|er)?|pre[- ]?poo|protein|clarify(?:ing|er)?|leave[- ]in|conditioner|cleanser|shampoo|co[- ]?wash|serum|gel|cream|butter|oil|emollient|cotton pad|cleansing pad|bonnet|satin|silk|scarf|heat hat|steam(?:er)?|wide[- ]tooth comb|denman|spray bottle|clips?|hooded dryer|diffuser|trim|banding)\b/i;

/** A verb that makes the member physically do something. */
const METHOD_VERB =
  /\b(apply|applying|rinse|rinsing|cleanse|wash|shampoo|condition|detangle|section|part|clip|smooth|seal|saturate|soak|dampen|spritz|mist|massage|comb|tuck|wrap|braid|re[- ]?braid|band|stretch|blot|squeeze|towel|wipe|swipe|dab|refresh|trim|split|space|swap|switch|cover|steam|warm|leave|sit|set|work)\b/i;

/** A timing anchor — when to do it. */
const TIMING =
  /\b(before|after|overnight|the night before|tonight|immediately|straight away|while (?:it'?s |still )?(?:damp|wet)|on (?:damp|wet|dry) hair|take[- ]?down|taking (?:them|it) (?:down|out)|install(?:ing|ation)?|mid[- ]week|next wash day|each wash day|at night|in the morning|first|then|afterwards?)\b/i;

/** A frequency or duration — how often / how long. */
const CADENCE =
  /\b(\d+\s*(?:–|-|to)?\s*\d*\s*(?:seconds?|secs?|minutes?|mins?|hours?|days?|weeks?|months?)|every\s+\d+|every (?:wash day|other day|week|fortnight|month)|once a (?:week|fortnight|month)|twice a (?:week|month)|weekly|fortnightly|monthly|daily|nightly)\b/i;

export interface SubstanceResult {
  ok: boolean;
  reasons: string[];
  /** Which method signals were found — useful for logging. */
  signals: string[];
}

const STOP = new Set([
  "your", "you", "with", "that", "this", "from", "into", "them", "they",
  "their", "hair", "the", "and", "for", "under", "underneath", "when", "will",
  "have", "each", "over", "onto", "while", "which", "what", "than", "then",
  "keeps", "keep", "help", "helps", "stops", "stop", "more", "less", "very",
  "afro", "strand", "strands",
]);

const stem = (w: string) =>
  w.replace(/(ing|edly|ed|ies|es|s)$/i, "").toLowerCase();

const contentTokens = (s: string): Set<string> => {
  const out = new Set<string>();
  for (const raw of (s ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || STOP.has(raw)) continue;
    const st = stem(raw);
    if (st.length >= 3) out.add(st);
  }
  return out;
};

/** Which method signals a piece of copy carries. */
export function methodSignals(text: string): string[] {
  const t = text ?? "";
  const signals: string[] = [];
  if (INTERVENTION.test(t)) signals.push("intervention");
  if (METHOD_VERB.test(t)) signals.push("method_verb");
  if (TIMING.test(t)) signals.push("timing");
  if (CADENCE.test(t)) signals.push("cadence");
  return signals;
}

/**
 * METHOD PRESENCE — the tip body must name something the member does.
 *
 * Passes when the copy carries a named intervention or a method verb. A timing
 * or cadence alone is not enough (the member still would not know what to do),
 * but a method verb plus a timing is the ideal shape.
 */
export function validateTipMethod(input: {
  /** Everything the member will read as the substance of the tip. */
  text: string;
}): SubstanceResult {
  const text = (input.text ?? "").replace(/\s+/g, " ").trim();
  const signals = methodSignals(text);
  const reasons: string[] = [];
  if (!text) {
    return { ok: false, reasons: ["method_text_missing"], signals };
  }
  const hasMethod = signals.includes("intervention") || signals.includes("method_verb");
  if (!hasMethod) reasons.push("no_method_named");

  // Outcome-only substance: the copy's only doing-words are intentions.
  const lower = text.toLowerCase();
  const outcomeHits = OUTCOME_ONLY.filter((w) => lower.includes(w)).length;
  if (!hasMethod && outcomeHits > 0) reasons.push("outcome_only_language");

  return { ok: reasons.length === 0, reasons, signals };
}

/**
 * TAUTOLOGY — the body must not restate the headline's goal as its own benefit.
 *
 * Structure of the check:
 *  - Reduce the headline to its goal tokens (content words, intentions stripped).
 *  - Split the body at its benefit connector ("prevents", "so that", "keeps"…).
 *  - It is circular when the same goal tokens appear on BOTH sides of that
 *    connector, or when the body simply re-uses the headline's goal tokens and
 *    names no method at all.
 */
export function validateTipTautology(input: {
  headline: string;
  body: string;
}): SubstanceResult {
  const headline = (input.headline ?? "").replace(/\s+/g, " ").trim();
  const body = (input.body ?? "").replace(/\s+/g, " ").trim();
  const signals = methodSignals(body);
  if (!headline || !body) return { ok: true, reasons: [], signals };

  const stripOutcome = (s: string) => {
    let out = s.toLowerCase();
    for (const w of OUTCOME_ONLY) out = out.split(w).join(" ");
    return out;
  };
  const goal = contentTokens(stripOutcome(headline));
  if (goal.size === 0) return { ok: true, reasons: [], signals };

  const bodyTokens = contentTokens(stripOutcome(body));
  let shared = 0;
  for (const t of goal) if (bodyTokens.has(t)) shared++;
  const restatement = shared / goal.size;

  const hasMethod = signals.includes("intervention") || signals.includes("method_verb");
  const reasons: string[] = [];

  // Circular both-sides test.
  const connector = body.match(
    /\b(prevents?|prevent|stops?|avoids?|so that|so she|which means|which keeps|keeps?|protects?|helps?|reduces?|maintains?)\b/i,
  );
  if (connector?.index != null) {
    const left = contentTokens(stripOutcome(body.slice(0, connector.index)));
    const right = contentTokens(stripOutcome(body.slice(connector.index + connector[0].length)));
    let bothSides = 0;
    for (const t of goal) if (left.has(t) && right.has(t)) bothSides++;
    let echo = 0;
    for (const t of left) if (goal.has(t)) echo++;
    const leftEchoesGoal = left.size > 0 && echo / left.size >= 0.5;
    if (bothSides > 0 || (leftEchoesGoal && !hasMethod)) {
      reasons.push("tautological_justification");
    }
  }

  // Restates the goal and offers no method to get there.
  if (!reasons.length && restatement >= 0.5 && !hasMethod) {
    reasons.push("restates_headline_without_method");
  }

  return { ok: reasons.length === 0, reasons, signals };
}

/** Both floors at once, for a headline + body pair. */
export function validateTipSubstance(input: {
  headline?: string;
  body: string;
}): SubstanceResult {
  const method = validateTipMethod({ text: input.body });
  const taut = validateTipTautology({
    headline: input.headline ?? "",
    body: input.body,
  });
  const reasons = [...method.reasons, ...taut.reasons];
  return { ok: reasons.length === 0, reasons, signals: method.signals };
}

/** Corrective instruction appended to the retry prompt. */
export function methodRetryDirective(reasons: string[]): string {
  const lines: string[] = [
    "YOUR PREVIOUS OUTPUT WAS REJECTED for lacking method. Failures: " +
      reasons.join(", ") + ".",
  ];
  if (reasons.includes("no_method_named") || reasons.includes("method_text_missing")) {
    lines.push(
      '- The tip names no method. Name a SPECIFIC intervention from the retrieved manuscript passages — a treatment, a technique, a step, a product TYPE, a tool, a frequency or a duration — and say what she physically does.',
    );
  }
  if (reasons.includes("outcome_only_language")) {
    lines.push(
      '- "Maintain", "protect", "keep", "look after", "prioritise", "focus on" are intentions, not methods. Convert them into something she does, with a timing.',
    );
  }
  if (
    reasons.includes("tautological_justification") ||
    reasons.includes("restates_headline_without_method")
  ) {
    lines.push(
      '- The justification is circular: it restates the headline\'s goal as its own benefit. Replace it with the MECHANISM or the CONSEQUENCE stated in the retrieved passages, and add the timing the passages support (before installing, after taking down, on damp hair, overnight).',
    );
  }
  lines.push(
    "- Stay inside the retrieved manuscript passages. If they support no method for this topic, choose a DIFFERENT tip that they DO support rather than writing a principle.",
  );
  return lines.join("\n");
}
