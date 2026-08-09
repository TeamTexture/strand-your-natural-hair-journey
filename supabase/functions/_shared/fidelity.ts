// MANUSCRIPT FIDELITY FAIL-SAFE
// =============================
// 2026-08-09. The author's rule: nothing the app states as hair care fact may
// be untraceable to her manuscript. Every deterministic rule below quotes the
// manuscript passage it enforces — a rule may never encode a fact the source
// does not state.
//
// Verified source passages used here:
//   - Ch 13, p.164 "TOP CLEANSING TIPS": "Be prepared to do at least two
//     cleanses... I'll go in with an all-purpose shampoo first, sometimes for
//     two shampoos and then follow up with a conditioning shampoo"; "focus on
//     the scalp, using the pads of your fingertips – NOT your nails"; "ALWAYS
//     follow up with a conditioner".
//   - Ch 14, p.173 "How to seal in moisture": sealing/locking moisture in is
//     rejected — "water is always going to evaporate"; focus on replenishing.
//   - Ch 14, p.174/176: moisture is water content in the shaft; "The only thing
//     that can provide our hair with moisture is water"; oils "soften, coat,
//     seal and slow moisture loss".
//   - Ch 14, p.178 "Leave-in conditioners": lightweight conditioning styling
//     products with low to no hold, optional, used for slip and a light
//     'moisturising' base before styling.

//
// This module is the fail-safe. It runs on generated output BEFORE the user
// sees it, in two stages:
//
//   Stage 1 — DETERMINISTIC RULES. Known, author-verified facts. A violation
//             is always a rejection, regardless of what the model retrieved.
//   Stage 2 — TRACEABILITY. An independent model pass that checks every claim
//             against the supplied source text and lists the unsupported ones.
//
// Rejections are logged to `public.ai_fidelity_rejections` for author review,
// and the caller regenerates once with the violations fed back. If the second
// attempt still fails, the surface returns nothing rather than unverified hair
// care advice.

declare const Deno: { env: { get(key: string): string | undefined } };

export interface FidelityViolation {
  /** The offending sentence or phrase from the model's output. */
  claim: string;
  /** Why it was rejected. */
  reason: string;
  rule: string;
}

export interface FidelityResult {
  ok: boolean;
  violations: FidelityViolation[];
}

// ---------------------------------------------------------------------------
// Stage 1 — deterministic, author-verified rules
// ---------------------------------------------------------------------------

interface DeterministicRule {
  id: string;
  reason: string;
  /** Return the offending excerpt, or null when the text is clean. */
  detect: (text: string) => string | null;
}

const sentences = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Cleanse sequencing. Ch 13, p.164: the all-purpose (or clarifying) shampoo
 * comes FIRST, and the conditioning/moisturising shampoo is what you follow up
 * with. The source makes no claim about a lengths-then-scalp order, so no rule
 * may assert one.
 */
const CLEANSE_ORDER: DeterministicRule = {
  id: "cleanse-order",
  reason:
    "Reverses the cleansing sequence. The source states you go in with an all-purpose (or clarifying) shampoo first and follow up with a conditioning/moisturising shampoo as the later cleanse.",
  detect: (text) => {
    for (const s of sentences(text)) {
      const l = s.toLowerCase();
      const conditioningFirst =
        /\b(first|1st|initial|start(?:ing)?|begin)\b[^.]{0,80}\b(conditioning|moisturis(?:ing|er)|co-?wash)\b[^.]{0,40}\b(shampoo|cleanse|wash)\b/
          .test(l);
      const clarifyingSecond =
        /\b(second|2nd|then|follow(?:\s+up)?)\b[^.]{0,80}\b(all-?purpose|clarif(?:y|ying)|chelating)\b[^.]{0,40}\b(shampoo|cleanse)\b/
          .test(l);
      if (conditioningFirst || clarifyingSecond) return s;
    }
    return null;
  },
};

/** Ch 13, p.164: agitate the scalp with the pads of the fingertips, NOT nails. */
const SCALP_NAILS: DeterministicRule = {
  id: "scalp-nails",
  reason:
    "The source instructs agitating the scalp with the pads of the fingertips, explicitly NOT the nails.",
  detect: (text) => {
    for (const s of sentences(text)) {
      const l = s.toLowerCase();
      if (/\bnails?\b/.test(l) && /\bscalp\b/.test(l) && !/\bnot\b|\bnever\b|\bavoid\b|\brather than\b|\binstead of\b/.test(l)) {
        return s;
      }
    }
    return null;
  },
};

/**
 * Leave-in described as adding hydration or moisture. Ch 14, p.178: a leave-in
 * is a lightweight conditioning styling product used for slip and a light
 * conditioning base. Ch 14, p.176: only water provides moisture.
 */
const LEAVE_IN_HYDRATES: DeterministicRule = {
  id: "leave-in-hydrates",
  reason:
    "The source describes a leave-in as a lightweight conditioning styling product used for slip and a light conditioning base, and states that only water provides moisture. A leave-in must not be described as hydrating or adding moisture.",
  detect: (text) => {
    for (const s of sentences(text)) {
      const l = s.toLowerCase();
      if (!/\b(leave-?in|leave in|cream|butter|styler)\b/.test(l)) continue;
      if (
        /\b(?:hydrates?|hydrating|adds?\s+(?:moisture|hydration|water)|injects?\s+moisture|replenish(?:es|ing)?\s+moisture|delivers?\s+moisture|infuses?\s+(?:moisture|hydration)|moisturis(?:es|ing)\s+the\s+(?:hair|strand))\b/
          .test(l)
      ) {
        return s;
      }
    }
    return null;
  },
};

/** Ch 14, p.173: "sealing"/"locking" moisture in is explicitly rejected. */
const SEALS_MOISTURE_IN: DeterministicRule = {
  id: "seals-moisture-in",
  reason:
    "The source rejects the idea that a product seals or locks moisture into the hair — water evaporates regardless, so the focus is replenishing moisture, not trapping it.",
  detect: (text) => {
    for (const s of sentences(text)) {
      const l = s.toLowerCase();
      if (
        /\b(seals?|sealing|locks?|locking|traps?|trapping)\s+(?:the\s+)?(?:moisture|hydration|water)\s+(?:in|into|inside)\b/
          .test(l) ||
        /\b(seals?|sealing|locks?|locking|traps?|trapping)\s+in\s+(?:the\s+)?(?:moisture|hydration|water)\b/
          .test(l) ||
        /\b(?:moisture|water|hydration)[-\s]?(?:seal|lock|trap)(?:ing|s|ed)?\b/.test(l) ||
        /\b(?:loc|lco)\s+method\b/.test(l)
      ) {
        return s;
      }

    }
    return null;
  },
};

/** Water is the only true source of moisture — nothing else may claim it. */
const ONLY_WATER_MOISTURISES: DeterministicRule = {
  id: "product-as-moisture-source",
  reason:
    "The source states that the only thing that can provide hair with moisture is water; products act on water already in the hair. A product must not be described as the source of moisture.",
  detect: (text) => {
    for (const s of sentences(text)) {
      const l = s.toLowerCase();
      if (
        /\b(oil|butter|shea|coconut oil|conditioner)\b[^.]{0,50}\b(moisturis(?:es|e)|hydrates?)\b[^.]{0,30}\b(hair|strands?|scalp)\b/
          .test(l)
      ) {
        return s;
      }
    }
    return null;
  },
};

const DETERMINISTIC_RULES: DeterministicRule[] = [
  CLEANSE_ORDER,
  SCALP_NAILS,
  LEAVE_IN_HYDRATES,
  SEALS_MOISTURE_IN,
  ONLY_WATER_MOISTURISES,
];


/** Run the deterministic, author-verified rules over any output text. */
export function checkDeterministicRules(text: string): FidelityViolation[] {
  const out: FidelityViolation[] = [];
  for (const rule of DETERMINISTIC_RULES) {
    const hit = rule.detect(text);
    if (hit) out.push({ claim: hit, reason: rule.reason, rule: rule.id });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stage 2 — traceability check against the supplied source text
// ---------------------------------------------------------------------------

const VERIFIER_MODEL = "google/gemini-3.6-flash";

const VERIFIER_PROMPT =
  `You are a fact-tracing auditor. You are given SOURCE (the only permitted source of hair care fact) and OUTPUT (text written for a user).

Your job: list every hair care claim in OUTPUT that is NOT supported by SOURCE.

A claim is UNSUPPORTED if SOURCE does not state it, does not imply it directly, or states something different. Judge against SOURCE only — never against your own hair care knowledge, and never give the output the benefit of the doubt because a claim sounds correct or conventional. Widely-repeated industry claims that SOURCE does not make are UNSUPPORTED.

IGNORE and do not report:
- statements about the user's own recorded data (their hair type, porosity, style, goal, product names, blood marker values, dates, counts)
- encouragement, tone, greetings, instructions to log something in the app, or prompts to see a professional
- mentions of the TT Heat Hat or teamtexture.co.uk
- generic scheduling/logistics wording that makes no hair care claim

REPORT: mechanisms, causes, effects, benefits, harms, ingredient behaviour, technique sequencing, frequency claims, and terminology that SOURCE does not support.

Reply with JSON only: {"violations":[{"claim":"<exact sentence or phrase from OUTPUT>","reason":"<why SOURCE does not support it, one sentence>"}]}
An empty array means fully traceable.`;

/**
 * Model-based traceability audit. Returns violations found; on any transport
 * or parse failure it returns an empty list (deterministic rules still apply)
 * so a verifier outage cannot block the whole app.
 */
export async function checkTraceability(
  output: string,
  sourceText: string,
): Promise<FidelityViolation[]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key || !sourceText.trim() || !output.trim()) return [];

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: VERIFIER_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: VERIFIER_PROMPT },
          {
            role: "user",
            content: `SOURCE:\n${sourceText}\n\n---\n\nOUTPUT:\n${output}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[fidelity] verifier HTTP ${res.status}`);
      return [];
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return [];
    const parsed = JSON.parse(content) as {
      violations?: Array<{ claim?: string; reason?: string }>;
    };
    return (parsed.violations ?? [])
      .filter((v) => v && typeof v.claim === "string" && v.claim.trim())
      .slice(0, 12)
      .map((v) => ({
        claim: String(v.claim).slice(0, 600),
        reason: String(v.reason ?? "Not supported by the source material.").slice(0, 600),
        rule: "traceability",
      }));
  } catch (e) {
    console.warn("[fidelity] verifier failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export async function logRejections(
  functionName: string,
  violations: FidelityViolation[],
  meta: { attempt: number; regenerated: boolean; chapters: number[] },
): Promise<void> {
  if (violations.length === 0) return;
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return;
    // @ts-ignore — esm.sh URL import is Deno-native.
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from("ai_fidelity_rejections").insert(
      violations.map((v) => ({
        function_name: functionName,
        claim: v.claim,
        reason: `[${v.rule}] ${v.reason}`,
        attempt: meta.attempt,
        regenerated: meta.regenerated,
        chapters_in_context: meta.chapters,
      })),
    );
  } catch (e) {
    console.warn("[fidelity] failed to log rejections:", e);
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Collect all string leaves of an AI payload so the whole response is audited. */
export function collectText(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.trim().length > 12) out.push(value.trim());
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectText(v, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collectText(v, out);
  }
  return out;
}

export interface VerifyOptions {
  functionName: string;
  sourceText: string;
  chapters: number[];
  attempt?: number;
  /** Skip the model pass (deterministic rules always run). */
  skipTraceability?: boolean;
}

/**
 * Verify a generated payload (string or JSON object) against the source text.
 * Always runs the deterministic rules; runs the traceability audit when source
 * text is available. Logs every violation for author review.
 */
export async function verifyFidelity<T>(
  payload: T,
  opts: VerifyOptions,
): Promise<FidelityResult> {
  const text = collectText(payload).join("\n");
  if (!text.trim()) return { ok: true, violations: [] };

  const violations = checkDeterministicRules(text);
  if (!opts.skipTraceability) {
    violations.push(...(await checkTraceability(text, opts.sourceText)));
  }

  const attempt = opts.attempt ?? 1;
  if (violations.length > 0) {
    console.warn(
      JSON.stringify({
        event: "fidelity_rejection",
        fn: opts.functionName,
        attempt,
        chapters: opts.chapters,
        violations: violations.map((v) => v.rule),
      }),
    );
    await logRejections(opts.functionName, violations, {
      attempt,
      regenerated: attempt > 1,
      chapters: opts.chapters,
    });
  }
  return { ok: violations.length === 0, violations };
}

/** Corrective instruction fed back into the regeneration attempt. */
export function repairInstruction(violations: FidelityViolation[]): string {
  const list = violations
    .map((v, i) => `${i + 1}. "${v.claim}" — ${v.reason}`)
    .join("\n");
  return `Your previous answer was REJECTED for manuscript fidelity. These claims are not supported by the source material:

${list}

Rewrite it. Remove or correct every rejected claim using only what the source material states. Do not replace a rejected claim with a different unsupported one, and do not pad the answer — a shorter, fully supported answer is correct.`;
}

/**
 * Generate → verify → (once) regenerate. `generate` receives a corrective
 * instruction on the second attempt. Returns null when the second attempt is
 * still unverified: the surface must then show nothing rather than
 * unverifiable hair care advice.
 */
export async function generateVerified<T>(
  generate: (repair?: string) => Promise<T>,
  opts: Omit<VerifyOptions, "attempt">,
): Promise<T | null> {
  const first = await generate();
  const check = await verifyFidelity(first, { ...opts, attempt: 1 });
  if (check.ok) return first;

  const second = await generate(repairInstruction(check.violations));
  const recheck = await verifyFidelity(second, { ...opts, attempt: 2 });
  if (recheck.ok) return second;

  console.error(
    JSON.stringify({
      event: "fidelity_generation_abandoned",
      fn: opts.functionName,
      chapters: opts.chapters,
    }),
  );
  return null;
}

// ---------------------------------------------------------------------------
// Sentence-level repair (the universal fail-safe)
// ---------------------------------------------------------------------------
//
// Every AI response passes through sanitiseAndLog. Where a surface has not yet
// adopted generateVerified, the fail-safe still applies there: the offending
// sentence is REMOVED from the output before the user sees it, and the
// rejection is logged. Removing a sentence can only make the answer shorter and
// more conservative — never wrong. It can never leave an unsupported hair care
// claim on screen.

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Field values shorter than this are labels/names, never prose claims. */
const MIN_CLAIM_CHARS = 24;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Keys whose value is a label, not prose — never stripped. */
const LABEL_KEYS = new Set([
  "name",
  "title",
  "headline",
  "category",
  "label",
  "tone",
  "direction",
  "factor",
  "product_ref",
  "step",
  "n",
  "id",
  "slug",
  "chapter",
  "page",
]);

function stripSentence(text: string, claim: string): string {
  const target = norm(claim);
  if (target.length < MIN_CLAIM_CHARS) return text;
  const parts = text.split(/(?<=[.!?])(\s+)/);
  const kept: string[] = [];
  let removed = false;
  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      kept.push(part);
      continue;
    }
    const n = norm(part);
    // Only ever remove something that is itself a prose sentence, and only when
    // it genuinely corresponds to the rejected claim. A short label that merely
    // appears inside the claim (an ingredient name, a category) is never a
    // violation and must survive.
    const isProse = n.length >= MIN_CLAIM_CHARS && words(n) >= 4;
    const matches =
      n === target ||
      n.includes(target) ||
      (target.includes(n) && n.length >= Math.max(MIN_CLAIM_CHARS, target.length * 0.5));
    if (isProse && matches) {
      removed = true;
      continue;
    }
    kept.push(part);
  }
  if (!removed) return text;
  return kept
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function stripDeep<T>(value: T, claims: string[], key?: string): T {
  if (typeof value === "string") {
    if (key && LABEL_KEYS.has(key)) return value as unknown as T;
    let out: string = value;
    for (const c of claims) out = stripSentence(out, c);
    return out as unknown as T;
  }
  if (Array.isArray(value)) {
    const mapped = value.map((v) => stripDeep(v, claims, key));
    // Drop list items that lost all of their prose — an empty card is a visible
    // defect; omitting it is the conservative outcome.
    return mapped.filter((v) => !isHollow(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripDeep(v, claims, k);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * An object is hollow when it was meant to carry prose and now carries none —
 * every one of its non-label string fields is empty.
 */
function isHollow(value: unknown): boolean {
  if (typeof value === "string") return !value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([k, v]) => typeof v === "string" && !LABEL_KEYS.has(k),
  );
  if (entries.length === 0) return false;
  return entries.every(([, v]) => !String(v).trim());
}


/**
 * Universal fail-safe applied to every AI response. Deterministic rules always
 * run; the traceability audit runs only when source text was supplied (so a
 * surface with no manuscript context is not audited against nothing). Every
 * violation is logged, and the offending sentence is stripped.
 */
export async function enforceFidelity<T>(
  payload: T,
  functionName: string,
  sourceText: string,
  chapters: number[] = [],
  opts: { skipTraceability?: boolean } = {},
): Promise<T> {
  const result = await verifyFidelity(payload, {
    functionName,
    sourceText,
    chapters,
    skipTraceability: opts.skipTraceability || !sourceText.trim(),
  });
  if (result.ok) return payload;
  return stripDeep(payload, result.violations.map((v) => v.claim));
}
