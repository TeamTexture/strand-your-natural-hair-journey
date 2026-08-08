// tip-action — the quality floor every generated tip must clear.
//
// RULE: no matter how succinct the support level, a tip must contain a
// headline PLUS at least one concrete action the member can take on their
// NEXT wash day. A headline alone is never a tip.
//
// This module owns:
//  - the hedging-opener ban list,
//  - the imperative-verb check,
//  - the "is this actually about THIS member" check (at least one recorded
//    attribute referenced),
//  - a best-effort rejection log written to `ai_citation_violations` (the same
//    table AI guardrail failures are already audited in) so the rejection rate
//    is visible.
//
// Manuscript grounding is untouched by any of this: a tip that cannot be
// grounded must be regenerated, never downgraded to a headline.

declare const Deno: { env: { get(key: string): string | undefined } };

/** Hedging openers that produce a non-action. Banned at every level. */
const HEDGES = [
  /^\s*consider\b/i,
  /^\s*be mindful\b/i,
  /^\s*it'?s important to\b/i,
  /^\s*it is important to\b/i,
  /^\s*you (?:may|might) want to\b/i,
  /^\s*try to remember\b/i,
  /^\s*remember to\b/i,
  /^\s*think about\b/i,
  /\bbe mindful of\b/i,
];

/** Verbs that instruct the member to physically do something. */
const IMPERATIVE =
  /\b(apply|rinse|cleanse|wash|shampoo|condition|detangle|section|part|clip|smooth|seal|saturate|soak|dampen|spritz|mist|massage|work|comb|finger[- ]?comb|tuck|wrap|braid|re[- ]?braid|band|stretch|blot|squeeze|towel|air[- ]?dry|leave|sit|set|clarify|clean|wipe|swipe|dab|refresh|trim|book|log|swap|switch|start|stop|skip|add|use|keep|hold|check|feel|time|repeat|split|reduce|lower|raise|loosen|space|schedule)\b/i;

export interface ActionValidationInput {
  /** The single action sentence. */
  action: string;
  /** Supporting copy — used only for the personalisation check. */
  supporting?: string[];
  /** Tokens drawn from the member's recorded data (style, porosity, goals…). */
  attributeTokens: string[];
}

export interface ActionValidationResult {
  ok: boolean;
  /** Machine-readable reasons, safe to log. */
  reasons: string[];
}

/** Build the tokens a valid tip must reference at least one of. Everything
 *  here comes from the member's own recorded data. */
export function memberAttributeTokens(input: {
  hairProfile?: Record<string, unknown> | null;
  currentStyle?: Record<string, unknown> | null;
  goals?: Array<{ title?: string; category?: string }>;
  challenges?: string[];
  areasOfConcern?: string[];
  bloodFlags?: Array<{ marker: string }>;
  recentWashDay?: { date?: string } | null;
}): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (v == null) return;
    const s = String(v).trim();
    if (s.length < 3) return;
    for (const word of s.split(/[^A-Za-z0-9]+/)) {
      if (word.length >= 4) out.push(word.toLowerCase());
    }
  };
  const hp = input.hairProfile ?? {};
  push(hp.hair_type);
  push(hp.porosity);
  push(hp.density);
  push(hp.scalp_condition);
  push(hp.scalp);
  push((hp as Record<string, unknown>).length_category);
  const st = input.currentStyle ?? {};
  push(st.current_hairstyle);
  push(st.planned_next_style);
  push(st.current_style_tension);
  if (st.current_style_extensions === true) out.push("extensions");
  for (const g of input.goals ?? []) {
    push(g.title);
    push(g.category);
  }
  for (const c of input.challenges ?? []) push(c);
  for (const c of input.areasOfConcern ?? []) push(c);
  for (const b of input.bloodFlags ?? []) push(b.marker);
  if (input.recentWashDay?.date) out.push("last wash");
  return Array.from(new Set(out));
}

/** The quality floor. */
export function validateTipAction(input: ActionValidationInput): ActionValidationResult {
  const reasons: string[] = [];
  const action = (input.action ?? "").replace(/\s+/g, " ").trim();

  if (!action) {
    reasons.push("action_missing");
  } else {
    if (action.split(/\s+/).length < 4) reasons.push("action_too_short");
    if (HEDGES.some((re) => re.test(action))) reasons.push("action_hedged");
    if (!IMPERATIVE.test(action)) reasons.push("action_no_instructing_verb");
  }

  const haystack = [action, ...(input.supporting ?? [])].join(" ").toLowerCase();
  const tokens = input.attributeTokens ?? [];
  if (tokens.length > 0) {
    const referenced = tokens.some((t) =>
      t.includes(" ") ? haystack.includes(t) : new RegExp(`\\b${t}`, "i").test(haystack),
    );
    if (!referenced) reasons.push("not_personalised");
  }

  return { ok: reasons.length === 0, reasons };
}

/** The REASON floor — every tip must explain WHY, not only what.
 *
 *  Rejected when the reason is missing, too short, or is a restatement of the
 *  action rather than an explanation of it (high token overlap with the action
 *  and no explanatory framing).
 */
export function validateTipReason(input: {
  reason: string;
  action: string;
}): ActionValidationResult {
  const reasons: string[] = [];
  const reason = (input.reason ?? "").replace(/\s+/g, " ").trim();
  const action = (input.action ?? "").replace(/\s+/g, " ").trim();

  if (!reason) {
    reasons.push("reason_missing");
    return { ok: false, reasons };
  }
  const words = reason.split(/\s+/).filter(Boolean);
  if (words.length < 6) reasons.push("reason_too_short");

  const tokenise = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4),
    );
  const rTokens = tokenise(reason);
  const aTokens = tokenise(action);
  let shared = 0;
  for (const t of rTokens) if (aTokens.has(t)) shared++;
  const overlap = rTokens.size === 0 ? 1 : shared / rTokens.size;

  // Explanatory framing — a reason explains a mechanism or consequence.
  const explanatory =
    /\b(because|since|so that|which|helps|prevents|keeps|allows|means|reduces|protects|holds|slows|leaves|otherwise|left|builds|traps|weakens|strengthens|supports|makes|lets|why)\b/i.test(
      reason,
    );
  // A near-copy of the action with imperative phrasing is a restatement.
  const imperativeOpener = IMPERATIVE.test(words.slice(0, 2).join(" "));
  if (overlap > 0.6 && !explanatory) reasons.push("reason_restates_action");
  else if (imperativeOpener && !explanatory) reasons.push("reason_restates_action");

  return { ok: reasons.length === 0, reasons };
}

/** Corrective instruction fed back to the model on the retry pass. */
export function retryDirective(reasons: string[], attributeTokens: string[]): string {
  const named = attributeTokens.slice(0, 8).join(", ");
  return [
    "YOUR PREVIOUS OUTPUT WAS REJECTED. Failures: " + reasons.join(", ") + ".",
    "Return the JSON again, fixed:",
    '- "action" MUST be one complete sentence that starts with an instruction verb and tells this member exactly what to do on their NEXT wash day (what they physically do, where on the head, and with what type of product).',
    '- Never open with "consider", "be mindful", "it\'s important to", "you may want to" or "try to remember".',
    "- The tip must name at least one of this member's own recorded details: " + (named || "their recorded profile") + ".",
    '- "reason" MUST explain WHY the action matters for this member — the mechanism or the consequence of not doing it — grounded in the supplied manuscript passages. It must never restate the action in different words. If the why cannot be grounded, choose a DIFFERENT tip whose why can be.',
    "- Keep it grounded in the manuscript passages supplied. If the action cannot be grounded, choose a DIFFERENT grounded action rather than weakening it.",
    ...(reasons.includes("names_sponsored_product")
      ? ['- You named a product that is the subject of a paid campaign. Remove that name completely and describe the product TYPE instead. This tip is editorial, never an advert.']
      : []),
    ...(reasons.includes("names_unowned_product")
      ? ['- You named a product this member does not own. Only ever name something on her own shelf, or name nothing and describe the product type.']
      : []),
    ...(reasons.includes("action_over_minimal_cap")
      ? ['- "action" is TOO LONG: one sentence, MAXIMUM 20 words. Cut words, keep the instruction.']
      : []),
    ...(reasons.includes("reason_over_minimal_cap")
      ? ['- "reason" is TOO LONG: one sentence, MAXIMUM 18 words. Cut words, keep the why.']
      : []),
  ].join("\n");

}

/** Best-effort audit row so the rejection rate is visible alongside citation
 *  violations. Never throws. */
export async function logTipRejection(
  functionName: string,
  reasons: string[],
  rejectedText: string,
): Promise<void> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return;
    // @ts-ignore — esm.sh URL import is Deno-native.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const stripped_text = `ACTION VALIDATION REJECTION [${reasons.join(", ")}]\n\n${rejectedText}`.slice(0, 8000);
    await admin.from("ai_citation_violations").insert({
      function_name: `${functionName}:action-validation`,
      stripped_text,
      original_length: rejectedText.length,
      cleaned_length: 0,
    });
  } catch (e) {
    console.warn(`[tip-action] failed to log rejection for ${functionName}:`, e);
  }
}
