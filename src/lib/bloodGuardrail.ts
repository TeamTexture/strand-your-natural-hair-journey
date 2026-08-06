// Client-side mirror of the edge-function blood guardrail
// (`supabase/functions/_shared/blood-guardrail.ts`).
//
// Server-side enforcement runs at generation time. This is the render-time
// safety net: cached AI payloads written before the guardrail shipped, or
// third-party text paths, must never surface an invented causal link between
// a blood marker and a hair outcome.
//
// Default mode is "suppress": until Paige has curated at least one marker
// with `hair_link_status = 'established'` and approved wording, ANY sentence
// that mentions a blood marker together with hair language is dropped.

export type HairLinkStatus = "established" | "limited_evidence" | "none";

export interface MarkerRefRow {
  marker: string;
  display_name: string;
  hair_link_status: HairLinkStatus;
  hair_link_summary: string | null;
}

/** Marker-name fallback so the scrub keeps matching if the table read fails.
 *  Names only — no clinical data is encoded anywhere in the app. */
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

const CAUSAL = /\b(so|because|since|therefore|thus|hence|which is why|that is why|means (?:that )?you|means your|meaning|requires?|require|needs?|need to|drives?|causes?|caused by|leads? to|resulting in|results? in|affects?|affecting|impacts?|impacting|contributes? to|explains? why|why your|which slows|slowing|makes? your|supports?|helps? your|in order to|due to|as a result)\b/i;

const HAIR_TERMS = /\b(hair|hairline|edges?|strand|strands|curl|curls|coil|coils|scalp|shed|shedding|breakage|growth|regrowth|density|porosity|follicle|follicles|moisture|protein|wash day|wash-day|twists?|braids?|cornrows?|locs?|wig|weave|TWA|style|styling|deep conditioner|conditioner|shampoo|leave-in|trim|retention|length|tension|traction|elasticity|frizz)\b/i;

const MECHANISM = /\b(follicle|follicular|follicles|cell division|cellular division|keratinocyte|keratinisation|keratinization|hair shaft|cortex|cuticle layer|dermal papilla|anagen|telogen|catagen|matrix cells|blood flow to the scalp|oxygen to the follicle|protein synthesis|collagen synthesis|sebum production|hormonal pathway|androgen receptor|DHT|miniaturisation|miniaturization)\b/i;

const GP_SAFE = /\b(gp|doctor|clinician|nurse|pharmacist|medical professional)\b/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface MarkerLexicon {
  status: Map<string, HairLinkStatus>;
  re: RegExp | null;
  mode: "suppress" | "curated";
}

export function buildLexicon(rows: MarkerRefRow[] | undefined | null): MarkerLexicon {
  const status = new Map<string, HairLinkStatus>();
  const names: string[] = [];
  for (const r of rows ?? []) {
    for (const n of [r.marker, r.display_name]) {
      const key = String(n ?? "").trim().toLowerCase();
      if (!key) continue;
      status.set(key, r.hair_link_status);
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
  const mode = (rows ?? []).some(
    (r) => r.hair_link_status === "established" && (r.hair_link_summary ?? "").trim().length > 0,
  )
    ? "curated"
    : "suppress";
  return { status, re, mode };
}

/** The default lexicon: fallback marker names, suppress mode. */
export const SUPPRESS_LEXICON = buildLexicon([]);

export function splitSentences(text: string): string[] {
  return String(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'£])/)
    .filter((s) => s.trim().length > 0);
}

export function sentenceAllowed(sentence: string, lex: MarkerLexicon): boolean {
  if (MECHANISM.test(sentence) && !GP_SAFE.test(sentence)) return false;
  if (!lex.re) return true;
  lex.re.lastIndex = 0;
  const hits = [...sentence.matchAll(lex.re)].map((m) => m[1].toLowerCase());
  if (hits.length === 0) return true;
  if (!HAIR_TERMS.test(sentence)) return true; // pure blood fact — allowed
  if (lex.mode === "suppress") return false;
  if (!CAUSAL.test(sentence)) return true; // separate statements
  return hits.some((h) => lex.status.get(h) === "established");
}

/** Drop every disallowed sentence from a block of AI copy. Paragraph breaks
 *  are preserved; paragraphs emptied by the scrub disappear entirely. */
export function scrubBloodClaims(
  text: string | null | undefined,
  lex: MarkerLexicon = SUPPRESS_LEXICON,
): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return raw;
  const out: string[] = [];
  for (const para of raw.split(/\n{2,}/)) {
    const kept = splitSentences(para).filter((s) => sentenceAllowed(s, lex));
    const joined = kept.join(" ").trim();
    if (joined) out.push(joined);
  }
  return out.join("\n\n");
}
