// MECHANISM FLOOR AND TONE FLOOR
// ==============================
// 2026-08-09, at the author's instruction.
//
// THE "WHY" MUST BE A MECHANISM, NOT A BENEFIT.
//
// `reason` must describe WHAT PHYSICALLY HAPPENS — not what the member gains,
// not what it protects, not why it matters in the abstract.
//
//   Mechanism, acceptable:
//     "It coats the strand, which slows how fast water evaporates."
//     "Raised cuticles let water in easily and let it out just as easily."
//     "The conditioning agents cling to damaged spots on the cuticle, which is
//      where the tangles start."
//
//   Benefit or outcome, NOT acceptable as a reason:
//     "Keeps your hair healthy."
//     "Protects your ends."
//     "Supports your length goal."
//     "Helps maintain moisture."
//
// Detection is deterministic and two-sided:
//   1. Does the sentence name a PHYSICAL PROCESS or a physical part of the hair
//      having something done to it? (the mechanism markers below)
//   2. Is the sentence built only out of OUTCOME language? (the benefit markers)
// A reason with no mechanism marker fails. A reason whose only content is
// benefit language fails. An outcome clause is fine once a mechanism is stated
// — her own example ends on one ("so your hair stays hydrated for longer").
//
// TONE: succinct, simple, no scaremongering. State things neutrally, mention a
// relevant caution once, plainly, and never stack warnings or imply a product
// is unsafe.
//
// This module contains NO hair care copy.

/** Physical processes, and the physical structures they happen to. */
const MECHANISM = [
  // what a product physically does
  /\bcoat(?:s|ed|ing)?\b/i,
  /\bseal(?:s|ed|ing)?\b/i,
  /\bbarrier\b/i,
  /\bfilm\b/i,
  /\blayer(?:s|ing)?\b/i,
  /\bsits? on\b/i,
  /\bcling(?:s|ing)?\b/i,
  /\bbinds?\b/i,
  /\bdeposits?\b/i,
  /\bbuild(?:s)? up\b|\bbuild[- ]?up\b/i,
  /\bpenetrat\w*/i,
  /\babsorb\w*/i,
  /\bevaporat\w*/i,
  /\bslows?\b|\bslowing\b/i,
  /\bloses? water\b|\bwater loss\b|\bwater out\b|\bwater in\b/i,
  /\bswell(?:s|ing)?\b/i,
  /\bshrink\w*/i,
  /\bstretch\w*/i,
  /\bsoften(?:s|ing)?\b/i,
  /\bweighs? down\b|\bweight\b/i,
  /\bdrag\b|\bfriction\b|\bslip\b|\bglide\w*/i,
  /\btug\w*|\bpull\w*|\btension\b|\bstrain\b/i,
  /\bsnaps?\b|\bbreaks? (?:off|at|mid)\b|\bbreakage\b/i,
  /\btangle\w*|\bknot\w*|\bmat(?:s|ting|ted)\b/i,
  /\bdries? out\b|\bdrying out\b|\bdries\b/i,
  /\bholds? (?:it|that|the) (?:water|moisture)\b/i,
  /\bhard(?:ens|ening)?\b|\bcast\b|\bstiff\w*/i,
  // physical structures
  /\bcuticle\w*/i,
  /\bstrands?\b|\bshafts?\b|\bfollicle\w*/i,
  /\bscalp\b|\bpartings?\b|\bhairline\b|\bnape\b|\bends\b|\broots?\b/i,
  /\bsebum\b|\bdead skin\b|\bflake\w*/i,
  /\bminerals?\b|\blimescale\b|\bhard water\b|\bsalt\b/i,
  /\bprotein\b|\bkeratin\b|\bbonds?\b/i,
  /\bporous\b|\bporosity\b|\braised\b|\blift(?:s|ed|ing)?\b|\bopen\b|\bclosed\b/i,
];

/** Outcome language. Fine AFTER a mechanism; never a mechanism on its own. */
const BENEFIT_ONLY = [
  /\bhealth(?:y|ier|ie)?\b/i,
  /\bprotect\w*/i,
  /\bsupports?\b|\bsupporting\b/i,
  /\bboost\w*|\bpromot\w*|\bimprov\w*|\benhanc\w*|\boptimis\w*|\boptimiz\w*/i,
  /\bmaintain\w*|\bpreserv\w*/i,
  /\bbenefit\w*|\bgood for\b|\bbest for\b|\bthriv\w*/i,
  /\bgoals?\b/i,
  /\bstronger\b|\bstrength\b/i,
  /\blooks? better\b|\bfeels? better\b/i,
];

/** Alarming framing. A relevant caution may be stated ONCE, plainly. */
const ALARM_HARD = [
  /\btoxic\w*/i,
  /\bdanger\w*/i,
  /\bharmful\b|\bharm\b/i,
  /\bcarcinogen\w*/i,
  /\bunsafe\b/i,
  /\bdestroy\w*/i,
  /\bbeware\b/i,
  /\bat all costs\b/i,
  /\bpermanent damage\b/i,
  /\bsevere\w*/i,
];

/** Softer caution words. One is fine; stacked, it becomes scaremongering. */
const ALARM_SOFT = [
  /\birritat\w*/i,
  /\ballerg\w*/i,
  /\bsensitis\w*|\bsensitiz\w*/i,
  /\bstrip\w*/i,
  /\bdamag\w*/i,
  /\brisk\w*/i,
  /\bwarning\b/i,
  /\bavoid\b/i,
  /\bchemical\w*/i,
];

export interface FloorResult {
  ok: boolean;
  reasons: string[];
}

/**
 * THE MECHANISM FLOOR. Returns `reason_benefit_not_mechanism` when the reason
 * names an outcome without describing a physical process.
 */
export function validateMechanism(reason: string): FloorResult {
  const text = String(reason ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reasons: ["reason_missing"] };

  const mechanismHits = MECHANISM.filter((re) => re.test(text)).length;
  if (mechanismHits === 0) {
    return { ok: false, reasons: ["reason_benefit_not_mechanism"] };
  }
  // A sentence that is mostly outcome language with a single incidental
  // structure word ("protects your ends", "keeps your strands healthy") still
  // describes no process: require a process verb, not just a body part.
  const PROCESS_ONLY = MECHANISM.slice(0, 28);
  const hasProcess = PROCESS_ONLY.some((re) => re.test(text));
  const benefitHits = BENEFIT_ONLY.filter((re) => re.test(text)).length;
  if (!hasProcess && benefitHits > 0) {
    return { ok: false, reasons: ["reason_benefit_not_mechanism"] };
  }
  return { ok: true, reasons: [] };
}

/**
 * THE TONE FLOOR. Flags alarming framing and stacked warnings. Never blocks a
 * generation on its own — it feeds the single retry.
 */
export function validateTone(text: string): FloorResult {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { ok: true, reasons: [] };
  const reasons: string[] = [];
  if (ALARM_HARD.some((re) => re.test(t))) reasons.push("alarmist");
  const soft = ALARM_SOFT.filter((re) => re.test(t)).length;
  if (soft >= 2) reasons.push("warnings_stacked");
  return { ok: reasons.length === 0, reasons };
}

/** Prompt block. Used by every surface that generates a tip. */
export const MECHANISM_RULE = `THE "WHY" IS A MECHANISM, NOT A BENEFIT.
"reason" must say WHAT PHYSICALLY HAPPENS — one sentence, plain words.
- Mechanism, correct: "It coats the strand, which slows how fast water evaporates." / "Raised cuticles let water in easily and let it out just as easily." / "The conditioning agents cling to damaged spots on the cuticle, which is where the tangles start."
- Benefit or outcome, REJECTED: "Keeps your hair healthy." / "Protects your ends." / "Supports your length goal." / "Helps maintain moisture."
An outcome may close the sentence, but only after the physical process has been stated.`;

export const TONE_RULE = `TONE — SUCCINCT, SIMPLE, NEVER ALARMING.
- One action plus ONE sentence of mechanism. Do not add more because more is available. Do not lecture.
- Plain words, short sentences. No paragraph of explanation.
- Never scaremonger: no "toxic", "harmful", "dangerous", "beware", no stacked warnings, no implying a product is unsafe.
- Where a caution genuinely applies to THIS member, state it once, neutrally, and move on. Never list allergens.`;
