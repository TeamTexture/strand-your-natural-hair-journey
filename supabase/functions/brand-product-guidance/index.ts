// Personalised "how to get the most out of this product" guidance for a
// brand-offer product/tool, tailored to the requesting user's full STRAND
// profile. Uses Lovable AI Gateway (Gemini flash) with the locked STRAND
// persona so tone stays consistent across the app.
//
// SHAPE IS ENFORCED, NOT REQUESTED. The response is validated against hard
// structural limits (word caps, item counts) AND a repetition check that allows
// each of the member's hair characteristics to be mentioned at most once across
// the whole card. Non-conforming output is fed back to the model and
// regenerated; if it still fails, nothing is returned and the card is hidden.
// Manuscript grounding, citation sanitising and the blood guardrail are
// unchanged.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireEntitledUser as requireAuthedUser } from "../_shared/entitlement.ts";
import { STRAND_PERSONA, SCALP_PRODUCT_RULE } from "../_shared/strand-persona.ts";
import { sanitiseAndLog } from "../_shared/citation-log.ts";
import { BLOOD_CLAIM_RULES, VERBATIM_VALUE_RULE } from "../_shared/blood-guardrail.ts";
import { NON_PRESCRIPTIVE_RULES } from "../_shared/non-prescriptive.ts";
import { buildTipsLevelBlock } from "../_shared/tips-level.ts";
import { evidencePromptBlock } from "../_shared/evidence.ts";
import {
  loadManuscriptIngredients,
  matchIngredients,
  policyBBlock,
} from "../_shared/policy-b.ts";

import { validateMechanism, validateTone } from "../_shared/mechanism.ts";

import {
  validateTipAction,
  validateTipReason,
  memberAttributeTokens,
  hasInstructingVerb,
} from "../_shared/tip-action.ts";
import { gatewayFetch } from "../_shared/ai-meter.ts";

// Cost meter attribution (Phase 2) — observation only.
const AI_METER_META = { function_name: "brand-product-guidance", stage: 2 } as const;


/**
 * SOFT SIGNALS (2026-08-09, author's correction). Three simultaneous hard
 * requirements plus two-stage generation made the sponsored wash day tip slow
 * and same-shaped. Only three things block now: an action, a mechanism reason,
 * and personalisation to something the member has recorded. Everything else —
 * naming a declared ingredient, quoting a trait verbatim, the repetition gate —
 * is a PREFERENCE: it is logged, fed into the single retry, and never rejects.
 */
async function logSoft(
  userId: string | null,
  notes: string[],
  attempt: number,
  offending: string,
): Promise<void> {
  if (!notes.length) return;
  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  console.log(JSON.stringify({ event: "sponsored_tip_soft_miss", notes, attempt }));
  if (!url || !svc) return;
  try {
    // @ts-ignore Deno-native URL import
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const admin = createClient(url, svc, { auth: { persistSession: false } });
    await admin.from("tip_generation_rejections").insert(
      notes.map((rule) => ({
        function_name: "brand-product-guidance",
        surface: "sponsored-wash-day-tip",
        user_id: userId,
        stage: "soft",
        rule,
        detail: "preferred, not required — did not block",
        offending_text: offending.slice(0, 500),
        attempt,
      })),
    );
  } catch {
    /* logging must never break generation */
  }
}


declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (h: (req: Request) => Promise<Response>) => void;
};

interface Body {
  product: {
    id?: string;
    name: string;
    brand?: string | null;
    description?: string | null;
    kind?: "product" | "tool" | null;
    tool_kind?: string | null;
    external_url?: string | null;
    ingredients?: string[] | null;
    key_features?: string[] | null;
    materials?: string[] | null;
  };
  context: Record<string, unknown> | null;
}

interface Benefit {
  label: string;
  text: string;
}

interface GuidancePayload {
  headline: string;
  /** One-line, hair-specific reason this product is worth their time. Used as
   *  the personalised hook on ad surfaces (banner, offer page product rows). */
  fit_line: string;
  intro: string;
  benefits: Benefit[];
  steps: string[];
  /** Optional factual "be aware of" notes — max 2, educational not alarmist. */
  watch_outs: string[];
  /** WASH DAY SURFACE ONLY. The whole sponsored tip body: at most two
   *  sentences and 45 words, validated (not merely requested). */
  wash_day_tip?: string;
}



const SYSTEM = `${STRAND_PERSONA}

${BLOOD_CLAIM_RULES}

${VERBATIM_VALUE_RULE}

TASK
The user is looking at a sponsored brand product/tool inside the STRAND app. Explain — in Paige's voice — how THIS specific user can get the most out of THIS specific product, reasoning from the STRAND manuscript framework and their real profile data (hair characteristics, current style, goals, wash-day history, health flags, existing products/tools).

RESPONSE SHAPE
Return ONLY valid JSON with this exact shape (no prose, no code fences):
{
  "headline": string — ONE line, MAXIMUM 8 words,
  "fit_line_action": string — exactly ONE sentence, MAXIMUM 16 words, starting with an instruction verb,
  "fit_line_reason": string — exactly ONE sentence, MAXIMUM 14 words, stating the MECHANISM (what physically happens),

  "intro": string — exactly ONE sentence, MAXIMUM 20 words,
  "benefits": array of EXACTLY 3 objects (2 is acceptable ONLY if a third cannot be grounded) — { "label": 1-2 words, "text": ONE sentence, MAXIMUM 15 words },
  "steps": array of EXACTLY 3 strings — each ONE sentence, MAXIMUM 25 words,
  "watch_outs": array of 0-2 strings — each ONE sentence, MAXIMUM 18 words
}

NUANCE, NOT CENSORSHIP — WHERE THE BRAND'S CLAIM NEEDS EXPLAINING
- A brand claim may be referenced. Do not restate it as bare fact, and do not suppress it either: explain briefly what is actually happening. The standard, verbatim: "It doesn't add water to your hair — water does that on wash day. What it does is coat the strand and slow how fast that water evaporates, so your hair stays hydrated for longer."
- Accurate, educational, brief, and no swipe at the brand. One sentence. Never say a brand is wrong or misleading.

TONE — SUCCINCT, SIMPLE, NEVER ALARMING
- Plain words, short sentences, one idea at a time. Do not add more because more is available, and never lecture.
- No scaremongering: no "toxic", "harmful", "dangerous", no stacked warnings, no implying the product is unsafe. Where a caution genuinely applies to THIS member, state it once, neutrally. Never list allergens.

WATCH OUTS — WHAT THIS MEMBER SHOULD BE AWARE OF
- Return 1-2 only when there is something genuinely worth knowing for THIS member given what the item DOES (its mechanism: heat, tension, surface contact, materials, cadence of use) intersected with their real data. Otherwise return an empty array.
- Educate, never scare. State the mechanism and the factual consequence, then the practical adjustment — no dramatic language, no "damage warnings", no absolutes like "never", no implied harm that isn't established.
- Science-based and factual only. No medical claims, no diagnoses, no invented mechanisms, nothing the manuscript framework doesn't support.
- Tie each one to something real in their profile (a trait, goal, challenge, current style, or wash-day cadence). Drop it rather than inventing a reason.
- Do not repeat a benefit or a step in different words.



FIT LINE — THE ONLY TIP ON THE ADVERT ITSELF
Return it as TWO separate fields, "fit_line_action" and "fit_line_reason". They are joined into the single short tip the member reads on the banner, so between them they must be at most TWO sentences.
- "fit_line_action": ONE sentence, MAXIMUM 16 words, telling this member exactly WHAT TO DO with this product on their NEXT wash day — the physical action, where on the head, and at what point in their routine. It must start with an instruction verb (apply, smooth, seal, spritz, work, section, soak, blot, swap…). A statement of what the product contains or does is NOT an action and is rejected.
- "fit_line_reason": ONE sentence, MAXIMUM 14 words, stating WHAT PHYSICALLY HAPPENS — the mechanism, not the benefit. "It coats the strand, which slows how fast water evaporates" is a reason. "Keeps your hair healthy", "protects your ends", "supports your length goal" and "helps maintain moisture" are NOT reasons and are rejected. It must not restate the action.
- Personalise both to their RECORDED state: porosity, density, current or planned style, and their most recent logged wash day. Do not invent a trait.
- GOALS: you may reference a goal ONLY by the member's recorded goal label, verbatim, from user_context.goals[].title (e.g. "your Length goal"). NEVER write a vague paraphrase — "your goals", "your hair goals", "your retention goals", "your growth goals" and anything similar are BANNED and rejected. If no goal is recorded, reference no goal at all.
- Never marketing hype, never a greeting, no lists.


NAME THE BRAND AND THE PRODUCT
- Use the brand name and the product name EXACTLY as given in the payload — verbatim, same spelling and capitalisation. Never abbreviate, translate, re-order or invent a variant of either.
- The product name must appear at least once in the card (fit_line, intro or a step is the natural place). The brand name must appear at least once too — this is the brand's tip, so the member should see whose it is.
- Never guess at a name that is not in the payload, and never refer to "this product" throughout as if it were unnamed.

HARD LIMITS — output that breaks any of these is rejected and regenerated:
- headline ≤ 8 words. fit_line_action ≤ 16 words, one sentence. fit_line_reason ≤ 14 words, one sentence. intro ≤ 20 words, one sentence.
- benefits: 3 items (2 only if the third would be unsupported). label 1-2 words, Title Case, ideally ONE noun ("Penetration", "Moisture", "Retention"). text ≤ 15 words, ONE sentence.
- steps: 3 items, each ≤ 25 words, ONE sentence each, sequential and concrete.

NO REPETITION — THIS IS THE MAIN FAILURE MODE
- Each of the member's hair characteristics (porosity, texture, density, curl pattern, length/TWA, scalp state, a named style) may appear AT MOST ONCE across the ENTIRE card — headline, fit_line, intro, benefits and steps combined. Not once per section: once in total.

- Once the headline or intro establishes a characteristic, never restate it. Say "your hair" or nothing at all.
- Never open an item by restating context an earlier item already gave. No item may recap another.
- Banned: repeating phrases like "your high-porosity hair", "your TWA", "your rough-textured hair" more than once in the whole payload.

GROUNDING — UNCHANGED
- Reason from the manuscript framework. Do not fabricate mechanisms.
- Never loosen grounding to fill the word budget: if a claim cannot be made honestly inside the limit, drop that benefit and return 2 well-grounded ones.
- No book/chapter citations, no "Read more" lines.
- No medical claims, no diagnoses.
- If the product is a heat cap / deep-conditioning cap, only recommend it — never suggest plastic caps, shower caps or towels as alternatives.
- Return raw JSON only.

${NON_PRESCRIPTIVE_RULES}`;

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Tokens from the member's recorded data, for the shared personalisation
 *  check in `validateTipAction`. */
function attributeTokensFor(context: Record<string, unknown> | null): string[] {
  const c = (context ?? {}) as Record<string, unknown>;
  return memberAttributeTokens({
    hairProfile: (c.hairProfile ?? null) as Record<string, unknown> | null,
    currentStyle: (c.currentStyle ?? null) as Record<string, unknown> | null,
    goals: (c.goals ?? []) as Array<{ title?: string; category?: string }>,
    challenges: (c.challenges ?? []) as string[],
    recentWashDay: (Array.isArray(c.recentWashDays) ? (c.recentWashDays as Array<{ date?: string }>)[0] : null) ?? null,
  });
}

/** The recorded goal labels — the ONLY wording allowed when a goal is named. */
function recordedGoalLabels(context: Record<string, unknown> | null): string[] {
  const goals = ((context ?? {}).goals ?? []) as Array<Record<string, unknown>>;
  const out: string[] = [];
  for (const g of Array.isArray(goals) ? goals : []) {
    for (const key of ["title", "kind"]) {
      const v = g?.[key];
      if (typeof v === "string" && v.trim().length >= 3) out.push(v.trim().toLowerCase());
    }
  }
  return [...new Set(out)];
}

/** Generic goal references are banned outright: a goal is named with the
 *  member's own recorded label or it is not referenced at all. */
const GENERIC_GOAL_PATTERNS: RegExp[] = [
  /\byour\s+(?:hair\s+|retention\s+|growth\s+|overall\s+|personal\s+|current\s+|main\s+|stated\s+)?goals?\b/i,
  /\byour\s+\w+\s+goals?\b/i,
  /\bthe\s+goals?\s+you\b/i,
];

function goalReferenceProblem(
  text: string,
  context: Record<string, unknown> | null,
): string | null {
  if (!/\bgoals?\b/i.test(text)) return null;
  const labels = recordedGoalLabels(context);
  const lower = text.toLowerCase();
  // A recorded label appearing verbatim next to the word "goal" is the only
  // acceptable form.
  const named = labels.some((l) => lower.includes(l));
  if (named) return null;
  if (GENERIC_GOAL_PATTERNS.some((re) => re.test(text)) || !named) {
    return labels.length
      ? `the advert tip references a goal generically. Name the member's recorded goal label verbatim — one of: ${labels.join(", ")} (e.g. "your ${labels[0]} goal") — or remove the goal reference entirely. "your goals", "your hair goals" and "your retention goals" are banned.`
      : `the advert tip references a goal, but this member has no recorded goal. Remove the goal reference entirely.`;
  }
  return null;
}


const sentenceCount = (s: string) =>
  s.trim().replace(/([.!?])\s*$/, "$1").split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean).length;

/** Characteristic phrases pulled from the member's own profile data. Each of
 *  these may be referenced at most once across the whole card. */
function characteristicTerms(context: Record<string, unknown> | null): string[] {
  const out = new Set<string>();
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim().toLowerCase();
    if (t.length < 3) return;
    // Normalise stored enum values ("type_4c" → "4c", "high_porosity" → "high porosity").
    out.add(t.replace(/^type_/, "").replace(/_/g, " "));
  };
  const hair = (context?.hairProfile ?? null) as Record<string, unknown> | null;
  if (hair) {
    for (const key of [
      "porosity",
      "texture",
      "hair_texture",
      "density",
      "curl_pattern",
      "hair_type",
      "strand_thickness",
      "thickness",
      "length",
      "hair_length",
      "scalp_condition",
      "scalp_type",
      "elasticity",
    ]) {
      const v = hair[key];
      if (Array.isArray(v)) v.forEach(push);
      else push(v);
    }
  }
  const style = (context?.currentStyle ?? null) as Record<string, unknown> | null;
  if (style) {
    push(style.current_hairstyle);
    push(style.planned_next_style);
  }
  return [...out].filter((t) => t.length >= 3);
}

/** Count occurrences of a characteristic term across the assembled copy. */
function countTerm(haystack: string, term: string): number {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = haystack.match(new RegExp(`\\b${escaped}\\b`, "gi"));
  return m ? m.length : 0;
}

function validate(
  p: unknown,
  context: Record<string, unknown> | null,
  surface?: string,
  declared: string[] = [],
):
): {
  /** True only when nothing at all is wrong. */
  ok: boolean;
  /** Fatal: safety, grounding, mechanism, personalisation, structure. */
  problems: string[];
  /** Presentation-only: word budgets and repeated characteristics. */
  cosmetic: string[];
  soft: string[];
  value: GuidancePayload;
} {
  const problems: string[] = [];
  // COSMETIC MISSES — a word budget overrun or a characteristic named twice.
  // These are presentation faults, not safety or grounding faults, and they
  // must not be the reason a member sees no personalised line at all: they
  // drive a corrective retry, but a candidate whose ONLY faults are cosmetic
  // is served rather than discarded. Everything in `problems` stays fatal.
  const cosmetic: string[] = [];
  const soft: string[] = [];
  const isWashDay = surface === "wash_day";
  const raw = (p ?? {}) as Record<string, unknown>;


  const headline = String(raw.headline ?? "").trim();
  // The advert tip is generated as an action + a reason and joined into the one
  // short line the banner renders. Legacy single-field output is still accepted
  // as the action so a cached/older payload never crashes validation.
  const fitAction = String(raw.fit_line_action ?? raw.fitLineAction ?? raw.fit_line ?? raw.fitLine ?? "").trim();
  const fitReason = String(raw.fit_line_reason ?? raw.fitLineReason ?? "").trim();
  const fitLine = [fitAction, fitReason].filter(Boolean).join(" ");

  const intro = String(raw.intro ?? raw.fit_summary ?? "").trim();
  const benefitsRaw = Array.isArray(raw.benefits) ? raw.benefits : [];
  const stepsRaw = Array.isArray(raw.steps)
    ? raw.steps
    : Array.isArray(raw.how_to_use)
      ? raw.how_to_use
      : [];

  if (!headline) problems.push("headline is missing.");
  else if (words(headline) > 8) cosmetic.push(`headline is ${words(headline)} words — maximum 8.`);

  // THE ADVERT TIP FLOORS — the same shared helpers the goal tip and routine
  // tips use. An advert tip with no action, or a tautological reason, is
  // rejected and regenerated exactly like any other STRAND tip.
  //
  // Not applied on the wash day surface: that card renders `wash_day_tip`, which
  // carries its own contract (a sponsored suggestion, not STRAND instruction),
  // and fit_line is never shown there.
  if (!isWashDay) {
    if (!fitAction) problems.push("fit_line_action is missing — the advert tip must tell the member what to do.");
    else {
      if (words(fitAction) > 16) cosmetic.push(`fit_line_action is ${words(fitAction)} words — maximum 16.`);
      if (sentenceCount(fitAction) > 1) problems.push("fit_line_action must be exactly one sentence.");
    }
    if (!fitReason) problems.push("fit_line_reason is missing — the advert tip must explain why the action matters.");
    else {
      if (words(fitReason) > 14) cosmetic.push(`fit_line_reason is ${words(fitReason)} words — maximum 14.`);
      if (sentenceCount(fitReason) > 1) problems.push("fit_line_reason must be exactly one sentence.");
    }
    if (fitLine && sentenceCount(fitLine) > 2)
      problems.push("the advert tip must be at most TWO sentences in total.");
  }

  if (!isWashDay && (fitAction || fitReason)) {

    const tokens = attributeTokensFor(context);
    const actionCheck = validateTipAction({
      action: fitAction,
      supporting: [fitReason],
      attributeTokens: tokens,
    });
    if (!actionCheck.ok) {
      problems.push(
        `the advert tip failed the shared action floor (${actionCheck.reasons.join(", ")}) — "fit_line_action" must be one instruction telling this member what to physically do with the product on their next wash day, and it must reference at least one of their recorded details (${tokens.slice(0, 8).join(", ") || "their recorded profile"}).`,
      );
    }
    // THE MECHANISM FLOOR — the reason must describe what physically happens.
    const mech = validateMechanism(fitReason);
    if (!mech.ok) {
      problems.push(
        `"fit_line_reason" is not a mechanism (${mech.reasons.join(", ")}) — say what PHYSICALLY happens (what coats, slows, absorbs, lifts, rubs, evaporates or builds up), not what the member gains. Outcome phrases like "keeps hair healthy", "protects your ends" or "supports your goal" are rejected.`,
      );
    }
    const reasonCheck = validateTipReason({ reason: fitReason, action: fitAction });
    if (!reasonCheck.ok) {
      problems.push(
        `the advert tip failed the shared reason floor (${reasonCheck.reasons.join(", ")}) — "fit_line_reason" must explain the mechanism or the consequence for this member, never restate the action.`,
      );
    }
    // GOAL LABELS. A goal may only be named by its recorded label.
    const goalIssue = goalReferenceProblem(fitLine, context);
    if (goalIssue) problems.push(goalIssue);
    // TONE — succinct, simple, never alarming.
    const tone = validateTone([fitLine, intro].filter(Boolean).join(" "));
    if (!tone.ok) {
      problems.push(
        `the copy breaks the tone floor (${tone.reasons.join(", ")}) — state things neutrally and once. No alarming language, no stacked warnings, no framing an ingredient as a danger.`,
      );
    }
  }


  if (!intro) problems.push("intro is missing.");
  else {
    if (words(intro) > 20) cosmetic.push(`intro is ${words(intro)} words — maximum 20.`);
    if (sentenceCount(intro) > 1) problems.push("intro must be exactly one sentence.");
  }


  const benefits: Benefit[] = benefitsRaw
    .map((b) => {
      const o = (b ?? {}) as Record<string, unknown>;
      return { label: String(o.label ?? "").trim(), text: String(o.text ?? "").trim() };
    })
    .filter((b) => b.label && b.text);

  // WASH DAY SURFACE: the card shows ONE succinct tip, so benefits and steps
  // are not required there — a hard 3-item floor would only cause needless
  // regeneration failures for copy that is never rendered.
  if (!isWashDay && (benefits.length < 2 || benefits.length > 3)) {
    problems.push(`benefits has ${benefits.length} valid items — return exactly 3 (2 only if the third cannot be grounded).`);
  }
  benefits.forEach((b, i) => {
    const lw = words(b.label);
    if (lw < 1 || lw > 2) problems.push(`benefits[${i}].label is ${lw} words — must be 1-2 words.`);
    if (words(b.text) > 15) cosmetic.push(`benefits[${i}].text is ${words(b.text)} words — maximum 15.`);
    if (sentenceCount(b.text) > 1) problems.push(`benefits[${i}].text must be one sentence.`);
  });

  const steps = stepsRaw.map((s) => String(s ?? "").trim()).filter(Boolean);
  if (!isWashDay && steps.length !== 3) problems.push(`steps has ${steps.length} items — return exactly 3.`);
  steps.forEach((s, i) => {
    if (words(s) > 25) cosmetic.push(`steps[${i}] is ${words(s)} words — maximum 25.`);
    if (sentenceCount(s) > 1) problems.push(`steps[${i}] must be one sentence.`);
  });

  // THE SPONSORED WASH DAY TIP.
  //
  // HARD (blocks): an action, a reason that is a mechanism, personalisation to
  // something recorded, plus the shape cap (2 sentences / 45 words) and the ban
  // on generic goal references.
  // SOFT (logged, fed to the one retry, never blocks): naming a declared
  // ingredient and its function, quoting a trait verbatim, repetition.
  const washDayTip = String(raw.wash_day_tip ?? raw.washDayTip ?? "").trim();
  if (isWashDay) {
    if (!washDayTip) problems.push("wash_day_tip is missing — it is required on the wash day surface.");
    else {
      if (words(washDayTip) > 45)
        problems.push(`wash_day_tip is ${words(washDayTip)} words — maximum 45 words in total.`);
      if (sentenceCount(washDayTip) > 2)
        problems.push(`wash_day_tip is ${sentenceCount(washDayTip)} sentences — maximum 2 sentences.`);
      const goalIssue = goalReferenceProblem(washDayTip, context);
      if (goalIssue) problems.push(goalIssue.replace("the advert tip", "wash_day_tip"));

      const sentences = washDayTip
        .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
        .map((x) => x.trim())
        .filter(Boolean);
      const actionPart = sentences[0] ?? washDayTip;
      const reasonPart = sentences.slice(1).join(" ") || washDayTip;

      // HARD 1 — an action. Something to DO with the product.
      if (!hasInstructingVerb(actionPart))
        problems.push(
          "wash_day_tip has no action — its first sentence must tell this member what to physically DO with the product on their next wash day (apply, work, smooth, section, swap, spritz…). A description of what the product contains is not an action.",
        );

      // HARD 2 — the reason is a mechanism, not a benefit or outcome.
      const mech = validateMechanism(reasonPart);
      if (!mech.ok)
        problems.push(
          `wash_day_tip has no mechanism (${mech.reasons.join(", ")}) — say what PHYSICALLY happens on the strand or scalp. "supports your length goal", "keeps hair healthy" and "leaves hair soft" are outcomes, not mechanisms, and are rejected.`,
        );

      // HARD 3 — personalisation to something recorded. Any recorded signal
      // counts: a characteristic, a challenge, a concern, a style, a goal label.
      const recorded = [
        ...characteristicTerms(context),
        ...attributeTokensFor(context),
      ].filter((t) => t.length >= 3);
      const personalised = recorded.some((t) => countTerm(washDayTip, t) > 0);
      if (recorded.length && !personalised)
        problems.push(
          `wash_day_tip would read the same for any member — connect it to something this member has actually recorded (${recorded.slice(0, 8).join(", ")}). Paraphrasing their data is fine; it does not have to be quoted.`,
        );

      // SOFT — preferred route to the mechanism: name a declared ingredient (or
      // a tool's stated material/function). Sequence and technique tips are
      // equally good guidance and must not be penalised.
      if (declared.length && !declared.some((d) => countTerm(washDayTip, d) > 0)) {
        soft.push("no declared ingredient named — a named ingredient and its function is the preferred route to the mechanism, but sequence or technique is equally valid.");
      }
      // SOFT — verbatim trait quoting.
      if (personalised && !characteristicTerms(context).some((t) => countTerm(washDayTip, t) > 0)) {
        soft.push("personalised without quoting a recorded hair characteristic verbatim — acceptable, verbatim is preferred where it reads naturally.");
      }
    }
  }

  const watchRaw = Array.isArray(raw.watch_outs)
    ? raw.watch_outs
    : Array.isArray(raw.watchOuts)
      ? raw.watchOuts
      : [];
  const watchOuts = watchRaw.map((s) => String(s ?? "").trim()).filter(Boolean).slice(0, 2);
  watchOuts.forEach((s, i) => {
    if (words(s) > 18) cosmetic.push(`watch_outs[${i}] is ${words(s)} words — maximum 18.`);
    if (sentenceCount(s) > 1) problems.push(`watch_outs[${i}] must be one sentence.`);
    if (/\bnever\b|\bdamage\b|\bruin|\bdestroy|irreversib/i.test(s)) {
      problems.push(
        `watch_outs[${i}] uses alarmist wording — state the mechanism and the practical adjustment factually instead.`,
      );
    }
  });

  // Repetition gate — each stated characteristic at most once in the copy that
  // is actually rendered on this surface.
  const assembled = (
    isWashDay
      ? [headline, washDayTip]
      : [
          headline,
          fitLine,
          intro,
          ...benefits.map((b) => `${b.label} ${b.text}`),
          ...steps,
          ...watchOuts,
        ]
  ).join(" ");

  for (const term of characteristicTerms(context)) {
    const n = countTerm(assembled, term);
    if (n > 1) {
      (isWashDay ? soft : cosmetic).push(
        `"${term}" appears ${n} times across the card — each hair characteristic may appear at most ONCE in total. Remove the repeats and say "your hair" or nothing.`,
      );
    }
  }

  return {
    ok: problems.length === 0 && cosmetic.length === 0,
    problems,
    cosmetic,
    soft,
    value: {
      headline,
      fit_line: fitLine,
      intro,
      benefits: benefits.slice(0, 3),
      steps: steps.slice(0, 3),
      watch_outs: watchOuts,
      wash_day_tip: washDayTip || undefined,

    },
  };

}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // PRE-GENERATION PATH. `brand-tips-pregenerate` calls this function with the
  // service role key and a `pregen_user_id`, so sponsored tips can be written
  // in the background at campaign approval instead of on first view.
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const isServiceCall =
    !!svcKey && req.headers.get("Authorization") === `Bearer ${svcKey}`;

  let auth: Awaited<ReturnType<typeof requireAuthedUser>> | null = null;
  if (!isServiceCall) {
    auth = await requireAuthedUser(req, { allowBrand: true });
    if (auth instanceof Response) return auth;
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body?.product?.name) {
    return new Response(JSON.stringify({ error: "product.name is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "AI not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const pregenUserId = String((body as { pregen_user_id?: string }).pregen_user_id ?? "").trim();
  const userId = isServiceCall
    ? (pregenUserId || null)
    : (auth as { user: { id: string } }).user.id;
  if (isServiceCall && !userId) {
    return new Response(JSON.stringify({ error: "pregen_user_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Surface framing. `wash_day` is the sponsored wash day tip card, which now
  // REPLACES the educational tip when it renders, so it must be one succinct,
  // personalised read for the member's next wash day. The brand never supplies
  // or edits this text — only the product facts.
  const surface = (body as { surface?: string }).surface;

  // On the sponsored wash day tip the member's CURRENT / PLANNED STYLE is
  // deliberately withheld: this surface personalises on hair characteristics,
  // goals and challenges, and on what the product and its ingredients do.
  const rawContext = (body.context ?? null) as Record<string, unknown> | null;
  const promptContext =
    surface === "wash_day" && rawContext
      ? (() => {
          const { currentStyle: _cs, styleProfile: _sp, ...rest } = rawContext as Record<string, unknown>;
          return rest;
        })()
      : rawContext;

  const userMsg = JSON.stringify({
    product: body.product,
    user_context: promptContext ?? {},
  });

  const surfaceBlock =
    surface === "wash_day"
      ? `\n\nSURFACE: WASH DAY — SUCCINCT SPONSORED TIP\nAlso return a field "wash_day_tip": the ENTIRE tip body the member reads.\n- MAXIMUM 2 sentences and MAXIMUM 45 words in total. This is validated, not requested.\n- DO NOT reference the member's current or planned hairstyle on this surface. It is not supplied and must not be guessed at, named or implied.\n- THREE THINGS ARE REQUIRED, and nothing else is:\n  1. AN ACTION — the first sentence tells this member what to physically DO with this product on their next wash day: the move, where on the head, and where it falls in their routine. Name the product once.\n  2. A MECHANISM — say what physically happens on the strand or scalp. Never an outcome or benefit: "leaves hair soft", "supports your length goal", "keeps hair healthy" are all rejected.\n  3. PERSONALISATION — it must connect to something this member has actually recorded: a hair characteristic (porosity, density, texture, elasticity, thickness, scalp state), a challenge or area of concern, a recorded goal label, or their last logged wash day. You may paraphrase their data; you do not have to quote it word for word.\n- LEAD WITH THE PRODUCT'S FUNCTION AND ITS INGREDIENTS. The most useful tip explains what this product or a declared ingredient does on the strand or scalp and why that suits THIS member's characteristics, challenge or goal. Use the declared ingredient list when it supports the point; a tip about SEQUENCE or TECHNIQUE is also acceptable, but never force chemistry the evidence does not support.\n- VARY THE SHAPE. Sometimes the useful thing is where it goes in the routine, sometimes how much, sometimes how long you leave it, sometimes what to pair or not pair it with, sometimes which part of the hair it belongs on.\n- Where their hair data and the product's function do NOT align, say so plainly and briefly instead of inventing a fit.\n- No bullets on this surface — everything lives in those two sentences.\n- Suggest, never instruct — this is a sponsored suggestion, not STRAND guidance. Make no claim the manuscript or the ingredient evidence does not support.`
      : "";




  // TWO-STAGE GROUNDED GENERATION. Stage 1 reads chapters 15, 14 + 1 in full and
  // extracts the evidence; this call (stage 2) receives the evidence, which stays
  // the primary source.
  // REDUCED CONTEXT. Policy B already admits established cosmetic science for
  // ingredients the book does not name, so three full chapters to explain a
  // surfactant was mostly wasted spend. Chapter 1 (language, mandatory) plus
  // chapter 15 (Understanding Ingredients) — the single most relevant chapter.
  const evid = await evidencePromptBlock({
    fn: "brand-product-guidance",
    surface: "brand-product-guidance",
    memberContext: userMsg.slice(0, 4000),
    chapters: [1, 15],
  });
  const groundingBlock = evid.grounded ? `\n\n${evid.block}` : "";

  // GROUNDING POLICY B — sponsored product surface. Established cosmetic science
  // is permitted here for the ingredients the book does not cover, because the
  // manuscript cannot cover every commercial formula. The author still governs
  // every ingredient she covers, her lexicon still binds, and brand marketing is
  // never a source. The ingredient lookup makes constraint 1 mechanical rather
  // than a judgement each time. See _shared/policy-b.ts.
  const declared = (body.product.ingredients ?? [])
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
  const brandCopy = [
    body.product.description ?? "",
    ...(body.product.key_features ?? []),
  ].filter(Boolean).join("\n").slice(0, 1500) || null;
  const match = matchIngredients(declared, await loadManuscriptIngredients());
  const policyBlock = `\n\n${policyBBlock({
    productName: body.product.name,
    brandName: body.product.brand ?? null,
    declared,
    match,
    brandCopy,
  })}`;

  // THE PERSONALISATION FLOOR, STATED UP FRONT. The validator rejects a
  // fit_line_action that references none of the member's recorded details, and
  // the model was being asked to hit that bar without being told which words
  // satisfy it — a rejection that cost a whole extra generation. Naming the
  // exact tokens turns a guessing game into an instruction.
  const recordedWords = attributeTokensFor(body.context as Record<string, unknown> | null);
  const recordedBlock = recordedWords.length
    ? `\n\nTHIS MEMBER'S RECORDED DETAILS — "fit_line_action" MUST REFERENCE AT LEAST ONE OF THESE\n${recordedWords
        .slice(0, 16)
        .join(", ")}\nUse the member's own wording where it reads naturally. Referencing none of them is rejected. Do not invent a detail that is not listed here.`
    : "";

  const system = `${SYSTEM}${groundingBlock}${policyBlock}\n\n${SCALP_PRODUCT_RULE}${surfaceBlock}${recordedBlock}\n\n${buildTipsLevelBlock(
    (body.context as Record<string, unknown> | null | undefined)?.tipsLevel,
  )}`;



  try {
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: system },
      { role: "user", content: userMsg },
    ];

    let clean: GuidancePayload | null = null;
    // BEST NEAR-MISS. A candidate that cleared every safety, grounding and
    // mechanism floor and only overran a word budget (or named a trait twice).
    // Serving this beats serving nothing: every fault it carries is one the
    // member cannot come to harm from.
    let salvage: GuidancePayload | null = null;
    let lastProblems: string[] = [];


    // RETRY CAP: ONE. (Was 3 attempts / 2 retries.) One generation plus a single
    // corrective regeneration, then serve the best candidate that satisfies the
    // three hard rules and log the rest.
    const MAX_ATTEMPTS = 2;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !clean; attempt++) {
      const r = await gatewayFetch(AI_METER_META, "https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          // OUTPUT CAP — READ THIS BEFORE LOWERING IT.
          // Gemini 3.x Flash is a reasoning model: its thinking tokens are
          // billed and counted as OUTPUT tokens against this cap. The previous
          // cap of 2400 was consumed almost entirely by reasoning, so the JSON
          // body was cut off mid-string on EVERY call (`finish_reason: length`,
          // output_tokens pinned at 2378-2396). Both attempts then failed with
          // "Output was not valid JSON", the function returned
          // `guidance: null` after ~66s, and the advert's personalised line
          // never appeared. The card itself is ~250 tokens; the headroom below
          // is for the thinking, not the answer.
          max_tokens: 8000,
          // Keep the thinking short — this is an interactive ad surface and
          // reasoning tokens are what drives its latency.
          reasoning_effort: "low",
          messages,
          response_format: { type: "json_object" },
        }),
      });


      if (r.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again shortly" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (r.status === 402 || r.status === 403) {
        const txt = await r.text();
        const creditUnavailable =
          r.status === 402 ||
          txt.includes("credit_limit_reached") ||
          txt.includes("Workspace credit limit reached");
        if (!creditUnavailable) {
          return new Response(JSON.stringify({ error: `Upstream: ${txt.slice(0, 200)}` }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Credit exhaustion is an expected temporary service state, not a bad
        // advert request. Return 200 so the client can keep rendering the
        // approved advert without its optional personalised guidance instead
        // of Supabase surfacing an invocation error/blank-screen overlay.
        return new Response(JSON.stringify({ guidance: null, unavailable: "credits" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!r.ok) {
        const txt = await r.text();
        return new Response(JSON.stringify({ error: `Upstream: ${txt.slice(0, 200)}` }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const j = await r.json();
      const raw = j?.choices?.[0]?.message?.content ?? "{}";
      const finish = String(j?.choices?.[0]?.finish_reason ?? "");
      // TRUNCATION IS ITS OWN FAILURE MODE, and it used to be invisible: a cut
      // off body just read as "not valid JSON". Log it distinctly so a future
      // cap regression is diagnosable from the logs alone.
      const truncated = finish === "length" || finish === "MAX_TOKENS";
      if (truncated) {
        console.log(JSON.stringify({
          event: "guidance_output_truncated",
          fn: "brand-product-guidance",
          surface: surface === "wash_day" ? "sponsored-wash-day-tip" : "brand-product-guidance",
          attempt: attempt + 1,
          finish_reason: finish,
          completion_tokens: j?.usage?.completion_tokens ?? null,
        }));
      }
      // LENIENT PARSE. The model occasionally wraps the object in a code fence
      // or adds a stray leading line; a hard JSON.parse turned that into a 502
      // and a blank screen. Strip fences, then fall back to the outermost
      // {...} slice before giving up.
      let parsed: unknown = null;
      const candidates: string[] = [];
      const text = String(raw).trim();
      candidates.push(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
      for (const c of candidates) {
        try {
          parsed = JSON.parse(c);
          break;
        } catch {
          parsed = null;
        }
      }


      const result = validate(parsed, promptContext ?? null, surface, declared);

      // Soft signals are logged for author review and folded into the ONE
      // retry as preferences. They never reject.
      await logSoft(userId, result.soft, attempt + 1, String(raw).slice(0, 500));
      if (result.ok) {
        // Sanitise INSIDE the loop. The blood guardrail can strip a whole
        // sentence, and a stripped reason would otherwise ship an action-only
        // tip — the exact defect the floors exist to prevent. If the guardrail
        // removes the reason, regenerate instead of degrading the tip.
        const candidate = await sanitiseAndLog(result.value, "brand-product-guidance", {
          context: promptContext,
          surface: surface === "wash_day" ? "sponsored-wash-day-tip" : "brand-product-guidance",
          userId,
          // POLICY B. The sponsored gates (marketing detection, conflict
          // register, per-claim source labelling) run only on this path.
          policy: "B",
          product: {
            name: body.product.name,
            brand: body.product.brand ?? null,
            declared,
            covered: match.covered,
            brandCopy,
            claimLabels: Array.isArray((parsed as { claims?: unknown })?.claims)
              ? (parsed as { claims: Array<{ text?: unknown; source?: unknown }> }).claims
              : undefined,
          },
        });

        const survivedFloors =
          surface === "wash_day"
            ? !!String(candidate.wash_day_tip ?? "").trim()
            : sentenceCount(String(candidate.fit_line ?? "")) >= 2;
        if (survivedFloors) {
          clean = candidate;
          break;
        }
        lastProblems = [
          'part of your advert tip was removed by the blood-claim guardrail, leaving it without a reason. Rewrite "fit_line_reason" so it explains the hair-care mechanism only — never bridge a blood marker, medication or health value to a hair outcome.',
        ];
      } else {
        lastProblems = parsed === null
          ? [
              truncated
                ? "Your previous output ran out of room before the JSON closed. Think briefly, then return ONLY the compact JSON object — no preamble, no commentary, shortest wording that still satisfies the rules."
                : "Output was not valid JSON.",
            ]
          : result.problems;

      }
      if (attempt + 1 >= MAX_ATTEMPTS) break;
      messages.push({ role: "assistant", content: String(raw).slice(0, 4000) });
      messages.push({
        role: "user",
        content:
          `That output was REJECTED. Fix every problem below and return the corrected JSON only. ` +
          `Do NOT pad, do NOT loosen grounding — drop a benefit before you invent one.\n- ` +
          lastProblems.join("\n- ") +
          (result.soft.length
            ? `\n\nALSO PREFERRED (not required — do not sacrifice the three required things for these):\n- ${result.soft.join("\n- ")}`
            : ""),
      });
    }

    if (!clean) {
      // Personalised guidance is OPTIONAL copy. A validation miss must never
      // surface as an invocation error / blank screen — the caller renders the
      // approved advert without it.
      return new Response(
        JSON.stringify({ guidance: null, unavailable: "validation", problems: lastProblems }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ guidance: clean }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
