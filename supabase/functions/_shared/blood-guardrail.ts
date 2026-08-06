// Blood-marker guardrail — STRUCTURAL, not prompt-tuning.
//
// WHY THIS EXISTS
// `blood_results` stores marker/value/unit/status only. Nothing in the app
// describes what a marker means or whether it has any relationship to hair.
// The manuscript is a book about afro hair care, not haematology, so the
// manuscript-grounding layer has nothing to match a blood claim against.
// The model filled that vacuum by inventing causal bridges
// ("low LH and FSH ... so keep your hairline tension-free").
//
// THE RULE (hard-enforced here, in code, after generation):
//   * A blood FACT is allowed: marker, value, unit, reference range, whether
//     it sits outside that range, and "discuss it with your GP".
//   * Hair-care advice grounded in the manuscript is allowed.
//   * A CAUSAL link between the two is allowed ONLY when the marker's
//     `blood_marker_reference.hair_link_status = 'established'` AND curated
//     `hair_link_summary` wording exists.
//   * Mechanistic claims (follicle, cell division, hair shaft, etc.) are
//     never allowed unless they come from an approved source.
//
// KILL SWITCH
// Until curated reference rows exist, `bloodGuidanceMode()` returns
// "suppress": every sentence that mentions a blood marker AND any hair
// language is dropped from AI output. Members seeing nothing is strictly
// better than members seeing invented clinical reasoning.
//
// Every drop is logged to `public.ai_citation_violations` with
// `function_name = '<fn>:blood-guardrail'` so the failure rate is visible.

declare const Deno: { env: { get(key: string): string | undefined } };

export type HairLinkStatus = "established" | "limited_evidence" | "none";

export interface MarkerRef {
  marker: string;
  display_name: string;
  hair_link_status: HairLinkStatus;
  hair_link_summary: string | null;
  unit: string | null;
  ref_range_low: number | null;
  ref_range_high: number | null;
  plain_meaning: string | null;
}

/** Fallback lexicon used when the reference table cannot be read, so the
 *  guardrail never silently stops matching. Names only — no clinical data. */
const FALLBACK_MARKERS = [
  "ferritin", "serum iron", "transferrin", "transferrin saturation", "TIBC",
  "haemoglobin", "haematocrit", "MCV", "MCH", "MCHC", "red blood cells",
  "white blood cells", "platelets", "vitamin d", "vitamin b12", "b12",
  "folate", "zinc", "magnesium", "calcium", "TSH", "free t3", "free t4",
  "thyroid", "LH", "FSH", "oestrogen", "oestradiol", "progesterone",
  "prolactin", "testosterone", "DHEA-S", "SHBG", "cortisol", "AMH",
  "HbA1c", "CRP", "cholesterol", "HDL", "LDL", "triglycerides", "albumin",
  "creatinine", "urea", "uric acid", "globulin", "total protein",
];

let cache: { at: number; rows: MarkerRef[] } | null = null;
const TTL_MS = 60_000;

async function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  // @ts-ignore — esm.sh URL import is Deno-native.
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.95.0");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Load the curated reference rows (cached for a minute per isolate). */
export async function loadMarkerReference(): Promise<MarkerRef[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  try {
    const db = await admin();
    if (!db) return [];
    const { data, error } = await db
      .from("blood_marker_reference")
      .select("marker, display_name, hair_link_status, hair_link_summary, unit, ref_range_low, ref_range_high, plain_meaning");
    if (error) throw error;
    const rows = (data ?? []) as MarkerRef[];
    cache = { at: Date.now(), rows };
    return rows;
  } catch (e) {
    console.warn("[blood-guardrail] reference load failed:", e);
    return [];
  }
}

/** "suppress" while no curated `established` hair link exists anywhere;
 *  "curated" once Paige has approved at least one. Env override:
 *  STRAND_BLOOD_GUIDANCE=curated|suppress. */
export async function bloodGuidanceMode(
  rows?: MarkerRef[],
): Promise<"suppress" | "curated"> {
  const override = Deno.env.get("STRAND_BLOOD_GUIDANCE");
  if (override === "curated" || override === "suppress") return override;
  const ref = rows ?? (await loadMarkerReference());
  const hasCurated = ref.some(
    (r) => r.hair_link_status === "established" && (r.hair_link_summary ?? "").trim().length > 0,
  );
  return hasCurated ? "curated" : "suppress";
}

// ---------------------------------------------------------------- matching

const CAUSAL = /\b(so|because|since|therefore|thus|hence|which is why|that is why|means (?:that )?you|means your|meaning|requires?|require|needs?|need to|drives?|causes?|caused by|leads? to|resulting in|results? in|affects?|affecting|impacts?|impacting|contributes? to|explains? why|why your|which slows|slowing|makes? your|supports?|helps? your|in order to|due to|as a result)\b/i;

const HAIR_TERMS = /\b(hair|hairline|edges?|strand|strands|curl|curls|coil|coils|scalp|shed|shedding|breakage|growth|regrowth|density|porosity|follicle|follicles|moisture|protein|wash day|wash-day|twists?|braids?|cornrows?|locs?|wig|weave|TWA|style|styling|deep conditioner|conditioner|shampoo|leave-in|trim|retention|length|tension|traction|elasticity|frizz)\b/i;

const MECHANISM = /\b(follicle|follicular|follicles|cell division|cellular division|keratinocyte|keratinisation|keratinization|hair shaft|cortex|cuticle layer|dermal papilla|anagen|telogen|catagen|matrix cells|blood flow to the scalp|oxygen to the follicle|protein synthesis|collagen synthesis|sebum production|hormonal pathway|androgen receptor|DHT|miniaturisation|miniaturization)\b/i;

const GP_SAFE = /\b(gp|doctor|clinician|nurse|pharmacist|medical professional)\b/i;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface MarkerLexicon {
  /** marker name (lowercased) -> status */
  status: Map<string, HairLinkStatus>;
  /** curated wording for established markers, lowercased key */
  summary: Map<string, string>;
  /** regex matching any known marker name */
  re: RegExp | null;
}

export function buildLexicon(rows: MarkerRef[]): MarkerLexicon {
  const status = new Map<string, HairLinkStatus>();
  const summary = new Map<string, string>();
  const names: string[] = [];
  for (const r of rows) {
    for (const n of [r.marker, r.display_name]) {
      const key = String(n ?? "").trim().toLowerCase();
      if (!key) continue;
      status.set(key, r.hair_link_status);
      if (r.hair_link_summary) summary.set(key, r.hair_link_summary);
      names.push(key);
    }
  }
  for (const n of FALLBACK_MARKERS) {
    const key = n.toLowerCase();
    if (!status.has(key)) status.set(key, "none");
    names.push(key);
  }
  const uniq = [...new Set(names)].sort((a, b) => b.length - a.length);
  const re = uniq.length
    ? new RegExp(`(?<![a-z])(${uniq.map(escapeRe).join("|")})(?![a-z])`, "gi")
    : null;
  return { status, summary, re };
}

/** Split a block of prose into sentences, preserving the delimiter. */
export function splitSentences(text: string): string[] {
  return String(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'£])/)
    .filter((s) => s.trim().length > 0);
}

export interface SentenceVerdict {
  ok: boolean;
  reason?: "blood_hair_bridge" | "unsourced_mechanism" | "suppressed_blood_reference";
  marker?: string;
}

/**
 * Deterministic per-sentence check. `mode === "suppress"` drops ANY sentence
 * that mentions a marker together with hair language. In "curated" mode a
 * bridge is allowed only for markers whose status is `established`.
 */
export function checkSentence(
  sentence: string,
  lex: MarkerLexicon,
  mode: "suppress" | "curated",
): SentenceVerdict {
  const s = sentence;

  // 1 — mechanistic claims are never allowed from the model.
  if (MECHANISM.test(s) && !GP_SAFE.test(s)) {
    return { ok: false, reason: "unsourced_mechanism" };
  }

  if (!lex.re) return { ok: true };
  lex.re.lastIndex = 0;
  const hits = [...s.matchAll(lex.re)].map((m) => m[1].toLowerCase());
  if (hits.length === 0) return { ok: true };

  const hasHair = HAIR_TERMS.test(s);
  if (!hasHair) return { ok: true }; // pure blood fact — allowed

  if (mode === "suppress") {
    return { ok: false, reason: "suppressed_blood_reference", marker: hits[0] };
  }

  const established = hits.some((h) => lex.status.get(h) === "established");
  if (!CAUSAL.test(s)) return { ok: true }; // separate statements, no connector
  if (established) return { ok: true };
  return { ok: false, reason: "blood_hair_bridge", marker: hits[0] };
}

export interface GuardResult<T> {
  value: T;
  dropped: Array<{ text: string; reason: string; marker?: string }>;
}

function scrubString(
  text: string,
  lex: MarkerLexicon,
  mode: "suppress" | "curated",
  dropped: GuardResult<unknown>["dropped"],
): string {
  const paragraphs = text.split(/\n{2,}/);
  const keptParas: string[] = [];
  for (const para of paragraphs) {
    const kept: string[] = [];
    for (const sentence of splitSentences(para)) {
      const verdict = checkSentence(sentence, lex, mode);
      if (verdict.ok) kept.push(sentence);
      else dropped.push({ text: sentence, reason: verdict.reason!, marker: verdict.marker });
    }
    const joined = kept.join(" ").trim();
    if (joined) keptParas.push(joined);
  }
  return keptParas.join("\n\n");
}

function walk<T>(
  value: T,
  lex: MarkerLexicon,
  mode: "suppress" | "curated",
  dropped: GuardResult<unknown>["dropped"],
): T {
  if (typeof value === "string") return scrubString(value, lex, mode, dropped) as unknown as T;
  if (Array.isArray(value)) {
    return value
      .map((v) => walk(v, lex, mode, dropped))
      // Drop list items that were emptied entirely by the scrub.
      .filter((v) => !(typeof v === "string" && v.trim() === ""))
      .filter((v) => !(v && typeof v === "object" && isEmptyItem(v))) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = walk(v, lex, mode, dropped);
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

async function logDrops(
  fn: string,
  dropped: GuardResult<unknown>["dropped"],
): Promise<void> {
  try {
    const db = await admin();
    if (!db) return;
    const stripped_text = dropped
      .map((d) => `[${d.reason}${d.marker ? ` · ${d.marker}` : ""}] ${d.text}`)
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
 * member. Drops offending sentences (and items emptied by that), logs each
 * rejection, and returns the cleaned payload. Never throws.
 */
export async function enforceBloodSafety<T>(value: T, fn: string): Promise<T> {
  try {
    const rows = await loadMarkerReference();
    const mode = await bloodGuidanceMode(rows);
    const lex = buildLexicon(rows);
    const dropped: GuardResult<unknown>["dropped"] = [];
    const cleaned = walk(value, lex, mode, dropped);
    if (dropped.length > 0) {
      console.warn(`[blood-guardrail] ${fn}: dropped ${dropped.length} sentence(s), mode=${mode}`);
      await logDrops(fn, dropped);
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
1. You MAY state a blood fact: the marker name, the value with its unit, its reference range, and whether it sits inside or outside that range.
2. You MAY give hair care advice grounded in the retrieved manuscript passages.
3. You MAY NOT assert any causal or consequential link between a blood marker and a hair outcome or hair action. No "so", "which is why", "requires", "means you should", "affecting how", "therefore", "leads to", "because of" joining a marker to hair. Blood facts and hair advice are SEPARATE statements.
4. You MAY NOT describe a physiological mechanism — nothing about follicles, cell division, the hair shaft, growth cycles, or what a nutrient "does" in the body. Never invent a mechanism.
5. For an out-of-range marker, the ONLY correct output is: the value, the reference range, a plain statement that it sits outside the typical range, and a recommendation to discuss it with their GP. Nothing more. No hair bridge.
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
