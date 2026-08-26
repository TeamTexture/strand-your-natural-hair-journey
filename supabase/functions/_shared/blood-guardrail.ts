// Blood-marker guardrail — STRUCTURAL, not prompt-tuning.
//
// WHY THIS EXISTS
// The model was inventing causal bridges and mechanisms it cannot support:
//   * "Low LH and FSH signals require extra care around your hairline, so keep
//      your cornrows tension-free."  <- fabricated bridge, whole sentence
//   * "Your B12 reads 83 pmol/L, which is low and can slow cell division at
//      the follicle, affecting how your TWA retains density."  <- the value and
//      range are fine; the mechanism is invented.
//
// THE RULE (hard-enforced here, in code, after generation):
//   * A blood FACT is allowed: marker, value, unit, reference range, whether it
//     sits inside or outside that range, and "discuss it with your GP".
//   * Hair-care guidance grounded in the manuscript is allowed — including in
//     the same card as a blood fact, as a SEPARATE statement.
//   * A CAUSAL or CONSEQUENTIAL link joining a marker to a hair outcome or hair
//     action in one sentence is never allowed.
//   * A physiological MECHANISM (follicle, cell division, hair shaft, scalp
//     biology) is never allowed unless that wording is traceable to the
//     retrieved `manuscript_chunks` passages for this generation.
//
// THERE IS NO SUPPRESSION MODE AND NO REFERENCE TABLE.
// Blood-referencing guidance renders normally. Nothing depends on an admin
// populating anything. Only the two violations above are removed.
//
// Every rejection is logged to `public.ai_citation_violations` with
// `function_name = '<fn>:blood-guardrail'` so the failure rate is visible.

declare const Deno: { env: { get(key: string): string | undefined } };

/** Marker-name lexicon. Names ONLY — no clinical data is encoded anywhere in
 *  the app, and nothing here says what a marker means. */
const MARKER_NAMES = [
  "ferritin", "serum iron", "transferrin", "transferrin saturation", "TIBC",
  "haemoglobin", "haematocrit", "MCV", "MCH", "MCHC", "red blood cells",
  "white blood cells", "platelets", "vitamin d", "vitamin b12", "b12",
  "folate", "zinc", "magnesium", "calcium", "TSH", "free t3", "free t4",
  "thyroid", "LH", "FSH", "oestrogen", "oestradiol", "progesterone",
  "prolactin", "testosterone", "DHEA-S", "SHBG", "cortisol", "AMH",
  "HbA1c", "CRP", "cholesterol", "HDL", "LDL", "triglycerides", "albumin",
  "creatinine", "urea", "uric acid", "globulin", "total protein",
];

// ---------------------------------------------------------------- matching

/** Banned connectors joining a marker to a hair statement. */
const CAUSAL =
  /\b(so|because|since|therefore|thus|hence|which is why|that is why|this is why|means (?:that )?you(?: should)?|means your|meaning|requires?|require|needs?|need to|drives?|causes?|caused by|leads? to|resulting in|results? in|affects?|affecting|impacts?|impacting|contributes? to|explains? why|why your|which slows|slowing|makes? your|supports?|helps? your|in order to|due to|as a result)\b/i;

const HAIR_TERMS =
  /\b(hair|hairline|edges?|strand|strands|curl|curls|coil|coils|scalp|shed|shedding|breakage|growth|regrowth|density|porosity|follicle|follicles|moisture|protein|wash day|wash-day|twists?|braids?|cornrows?|locs?|wig|weave|TWA|style|styling|deep conditioner|conditioner|shampoo|leave-in|trim|retention|length|tension|traction|elasticity|frizz)\b/i;

/** Physiological-mechanism vocabulary. Allowed only when the same wording is
 *  traceable to the retrieved manuscript passages for this generation. */
const MECHANISM_TERMS = [
  "follicle", "follicular", "follicles", "cell division", "cellular division",
  "keratinocyte", "keratinisation", "keratinization", "hair shaft", "cortex",
  "cuticle layer", "dermal papilla", "anagen", "telogen", "catagen",
  "matrix cells", "blood flow to the scalp", "oxygen to the follicle",
  "protein synthesis", "collagen synthesis", "sebum production",
  "hormonal pathway", "androgen receptor", "DHT", "miniaturisation",
  "miniaturization",
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MARKER_RE = new RegExp(
  `(?<![a-z])(${
    [...MARKER_NAMES]
      .sort((a, b) => b.length - a.length)
      .map((n) => escapeRe(n.toLowerCase()))
      .join("|")
  })(?![a-z])`,
  "gi",
);

const MECHANISM_RE = new RegExp(
  `\\b(${
    [...MECHANISM_TERMS]
      .sort((a, b) => b.length - a.length)
      .map((t) => escapeRe(t.toLowerCase()))
      .join("|")
  })\\b`,
  "gi",
);

/** Split a block of prose into sentences, preserving the delimiter. */
export function splitSentences(text: string): string[] {
  return String(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'£])/)
    .filter((s) => s.trim().length > 0);
}

export interface SentenceVerdict {
  ok: boolean;
  reason?: "blood_hair_bridge" | "unsourced_mechanism";
  marker?: string;
  term?: string;
}

/** Manuscript text retrieved for this generation, used to decide whether a
 *  mechanism phrase is grounded. Empty string = nothing retrieved. */
export type Grounding = string;

function mechanismGrounded(term: string, grounding: Grounding): boolean {
  if (!grounding) return false;
  return grounding.toLowerCase().includes(term.toLowerCase());
}

/**
 * Deterministic per-sentence check.
 *
 * REJECT when:
 *   1. a mechanism phrase appears that is not traceable to `grounding`, or
 *   2. a marker name and a hair-care statement appear in the same sentence
 *      joined by a banned causal connector.
 *
 * Everything else passes — including a bare blood fact, a GP recommendation,
 * and hair guidance sitting beside a blood fact with no causal connector.
 */
export function checkSentence(
  sentence: string,
  grounding: Grounding = "",
): SentenceVerdict {
  const s = sentence;

  // 1 — mechanism claims, unless the wording is in the manuscript passages.
  MECHANISM_RE.lastIndex = 0;
  const mech = [...s.matchAll(MECHANISM_RE)].map((m) => m[1]);
  const ungrounded = mech.find((t) => !mechanismGrounded(t, grounding));
  if (ungrounded) return { ok: false, reason: "unsourced_mechanism", term: ungrounded };

  // 2 — marker + hair statement joined by a causal connector.
  MARKER_RE.lastIndex = 0;
  const hits = [...s.matchAll(MARKER_RE)].map((m) => m[1].toLowerCase());
  if (hits.length === 0) return { ok: true };
  if (!HAIR_TERMS.test(s)) return { ok: true }; // pure blood fact — allowed
  if (!CAUSAL.test(s)) return { ok: true }; // separate statements, no bridge
  return { ok: false, reason: "blood_hair_bridge", marker: hits[0] };
}

export interface GuardResult<T> {
  value: T;
  dropped: Array<{ text: string; reason: string; marker?: string; term?: string }>;
}

function scrubString(
  text: string,
  grounding: Grounding,
  dropped: GuardResult<unknown>["dropped"],
): string {
  const paragraphs = text.split(/\n{2,}/);
  const keptParas: string[] = [];
  for (const para of paragraphs) {
    const kept: string[] = [];
    for (const sentence of splitSentences(para)) {
      const verdict = checkSentence(sentence, grounding);
      if (verdict.ok) kept.push(sentence);
      else {
        dropped.push({
          text: sentence,
          reason: verdict.reason!,
          marker: verdict.marker,
          term: verdict.term,
        });
      }
    }
    const joined = kept.join(" ").trim();
    if (joined) keptParas.push(joined);
  }
  return keptParas.join("\n\n");
}

function walk<T>(
  value: T,
  grounding: Grounding,
  dropped: GuardResult<unknown>["dropped"],
): T {
  if (typeof value === "string") return scrubString(value, grounding, dropped) as unknown as T;
  if (Array.isArray(value)) {
    return value
      .map((v) => walk(v, grounding, dropped))
      // Drop list items that were emptied entirely by the scrub.
      .filter((v) => !(typeof v === "string" && v.trim() === ""))
      .filter((v) => !(v && typeof v === "object" && isEmptyItem(v))) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = walk(v, grounding, dropped);
    }
    return out as unknown as T;
  }
  return value;
}

/** An object item whose every string field is now empty carries no content. */
function isEmptyItem(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const entries = Object.values(v as Record<string, unknown>);
  const strings = entries.filter((e) => typeof e === "string") as string[];
  if (strings.length === 0) return false;
  return strings.every((s) => s.trim() === "");
}

async function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  // @ts-ignore — esm.sh URL import is Deno-native.
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function logDrops(
  fn: string,
  dropped: GuardResult<unknown>["dropped"],
): Promise<void> {
  try {
    const db = await admin();
    if (!db) return;
    const stripped_text = dropped
      .map((d) =>
        `[${d.reason}${d.marker ? ` · ${d.marker}` : ""}${d.term ? ` · ${d.term}` : ""}] ${d.text}`
      )
      .join("\n\n---\n\n")
      .slice(0, 8000);
    const original_length = dropped.reduce((a, d) => a + d.text.length, 0);
    await db.from("ai_citation_violations").insert({
      function_name: `${fn}:blood-guardrail`,
      stripped_text,
      original_length,
      cleaned_length: 0,
    });
  } catch (e) {
    console.warn(`[blood-guardrail] failed to log drops for ${fn}:`, e);
  }
}

/**
 * THE validation pass. Run on every generated payload BEFORE it reaches a
 * member. Rejects offending sentences (and items emptied by that), logs each
 * rejection, and returns the cleaned payload. Never throws.
 *
 * `grounding` is the retrieved manuscript text for this generation — pass it
 * so mechanism wording that IS in the manuscript survives.
 */
export async function enforceBloodSafety<T>(
  value: T,
  fn: string,
  grounding: Grounding = "",
  opts: { dryRun?: boolean } = {},
): Promise<T> {
  try {
    const dropped: GuardResult<unknown>["dropped"] = [];
    const cleaned = walk(value, grounding, dropped);
    if (dropped.length > 0) {
      console.warn(`[blood-guardrail] ${fn}: rejected ${dropped.length} sentence(s)`);
      if (!opts.dryRun) await logDrops(fn, dropped);
    }
    return cleaned;
  } catch (e) {
    console.warn(`[blood-guardrail] ${fn}: pass failed, returning input:`, e);
    return value;
  }
}

// ------------------------------------------------------- prompt constraint

/** Hard constraint appended to every system prompt that can see blood data.
 *  This is belt-and-braces only — enforcement is `enforceBloodSafety`. */
export const BLOOD_CLAIM_RULES = `BLOOD MARKER RULES — ABSOLUTE, ENFORCED IN CODE AFTER YOU REPLY:
1. You MAY state the member's own blood result as fact: the marker name, the value with its unit, its reference range, and whether it sits inside or outside that range. You MAY suggest they discuss it with their GP.
2. You MAY give hair care guidance grounded in the retrieved manuscript passages, in the same answer.
3. You MAY NOT assert a causal or consequential link between a blood marker and a hair outcome or hair action. Never join a marker to a hair statement with "so", "which is why", "requires", "means you should", "affecting how", "therefore", "as a result" or "this is why". Blood facts and hair guidance are SEPARATE statements with no connector between them.
4. You MAY NOT describe a physiological mechanism — nothing about what is happening at the follicle, at the cell, in the hair shaft or in the scalp — unless that teaching appears in the retrieved manuscript passages. Never invent a mechanism.
5. For an out-of-range marker, the correct output is: the value, the reference range, a plain statement that it sits outside the typical range, and a recommendation to discuss it with their GP. Then stop. No hair consequence, no mechanism, no bridge.
6. Any sentence breaking rules 3-5 is deleted before the member sees it and logged as a violation, which removes useful content from your answer. Write within the rules instead.`;

/** Verbatim-value rule for stored profile values (styles especially). */
export const VERBATIM_VALUE_RULE = `RECORDED VALUES — VERBATIM ONLY:
When you refer to the member's current or planned style, hair type, product or tool, use the EXACT stored string from the context. Never paraphrase, shorten, pluralise differently or substitute a similar-sounding name (a planned style of "passion twists" is never "rope twists"). If a value is absent from the context, do not name one.`;

// ---------------------------------------------------- style verbatim guard

/** Known style vocabulary — used only to detect that the model named A style
 *  other than the one on record when talking about the member's own style. */
const STYLE_WORDS = [
  "passion twists", "rope twists", "senegalese twists", "marley twists",
  "spring twists", "two-strand twists", "twist out", "twists",
  "knotless braids", "box braids", "micro braids", "cornrows", "braids",
  "faux locs", "locs", "dreadlocks", "bantu knots", "wash and go",
  "wash-and-go", "silk press", "blowout", "afro puff", "puff", "TWA",
  "wig", "weave", "sew-in", "crochet braids", "flat twists", "finger coils",
  "goddess braids", "fulani braids", "cane rows", "halo braid", "high puff",
  "roller set", "flexi rods", "perm rods", "bun", "buns", "ponytail",
];

/** Replace "your planned <style>" / "your current <style>" with the recorded
 *  value when the model named a different style. Deterministic repair — it
 *  never introduces a style the member has not recorded. */
export function enforceStyleVerbatim(
  text: string,
  recorded: { current?: string | null; planned?: string | null },
): { text: string; fixes: string[] } {
  const fixes: string[] = [];
  let out = String(text ?? "");
  const styleAlt = STYLE_WORDS.map(escapeRe).join("|");

  const apply = (kind: "planned" | "current", replacement: string | null | undefined) => {
    if (!replacement || !replacement.trim()) return;
    const rec = replacement.trim();
    const kw = kind === "planned" ? "planned(?:\\s+next)?" : "current";
    const re = new RegExp(`\\b((?:your|the)\\s+${kw}\\s+)(${styleAlt})\\b`, "gi");
    out = out.replace(re, (whole, lead: string, style: string) => {
      if (style.toLowerCase() === rec.toLowerCase()) return whole;
      fixes.push(`${kind}: "${style}" -> "${rec}"`);
      return `${lead}${rec}`;
    });
  };

  apply("planned", recorded.planned);
  apply("current", recorded.current);
  return { text: out, fixes };
}

/** Deep variant of `enforceStyleVerbatim` for whole AI payloads. */
export function enforceStyleVerbatimDeep<T>(
  value: T,
  recorded: { current?: string | null; planned?: string | null },
  fixes: string[] = [],
): T {
  if (typeof value === "string") {
    const r = enforceStyleVerbatim(value, recorded);
    fixes.push(...r.fixes);
    return r.text as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => enforceStyleVerbatimDeep(v, recorded, fixes)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = enforceStyleVerbatimDeep(v, recorded, fixes);
    }
    return out as unknown as T;
  }
  return value;
}

/** Pull the recorded style strings out of the standard `context` payload. */
export function recordedStyles(context: unknown): { current?: string | null; planned?: string | null } {
  const c = (context ?? {}) as Record<string, any>;
  const s = c.currentStyle ?? c.style ?? {};
  return {
    current: s.current_hairstyle ?? s.current ?? null,
    planned: s.planned_next_style ?? s.planned ?? null,
  };
}
