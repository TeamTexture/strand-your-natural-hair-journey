// Client-side mirror of the edge-function blood guardrail
// (`supabase/functions/_shared/blood-guardrail.ts`).
//
// Server-side enforcement runs at generation time. This is the render-time
// safety net for cached AI payloads written before the guardrail shipped.
//
// THERE IS NO SUPPRESSION MODE. Blood-referencing guidance renders normally.
// Only two things are removed:
//   1. a sentence where a blood marker name and a hair-care statement are
//      joined by a causal connector ("so", "which is why", "affecting how"...),
//   2. a sentence describing a physiological mechanism (follicle, cell
//      division, hair shaft, scalp biology) — at render time we have no
//      manuscript passages to trace it to, so it cannot be verified.
//
// A bare blood fact — marker, value, range, "speak to your GP" — always
// renders, as does hair guidance sitting beside it without a connector.

/** Marker names only. No clinical data is encoded anywhere in the app. */
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

/** Banned connectors joining a marker to a hair statement. */
const CAUSAL =
  /\b(so|because|since|therefore|thus|hence|which is why|that is why|this is why|means (?:that )?you(?: should)?|means your|meaning|requires?|require|needs?|need to|drives?|causes?|caused by|leads? to|resulting in|results? in|affects?|affecting|impacts?|impacting|contributes? to|explains? why|why your|which slows|slowing|makes? your|supports?|helps? your|in order to|due to|as a result)\b/i;

const HAIR_TERMS =
  /\b(hair|hairline|edges?|strand|strands|curl|curls|coil|coils|scalp|shed|shedding|breakage|growth|regrowth|density|porosity|follicle|follicles|moisture|protein|wash day|wash-day|twists?|braids?|cornrows?|locs?|wig|weave|TWA|style|styling|deep conditioner|conditioner|shampoo|leave-in|trim|retention|length|tension|traction|elasticity|frizz)\b/i;

const MECHANISM =
  /\b(follicle|follicular|follicles|cell division|cellular division|keratinocyte|keratinisation|keratinization|hair shaft|cortex|cuticle layer|dermal papilla|anagen|telogen|catagen|matrix cells|blood flow to the scalp|oxygen to the follicle|protein synthesis|collagen synthesis|sebum production|hormonal pathway|androgen receptor|DHT|miniaturisation|miniaturization)\b/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MARKER_RE = new RegExp(
  `(?<![a-z])(${
    [...MARKER_NAMES]
      .sort((a, b) => b.length - a.length)
      .map((n) => escapeRe(n.toLowerCase()))
      .join("|")
  })(?![a-z])`,
  "gi",
);

export function splitSentences(text: string): string[] {
  return String(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'£])/)
    .filter((s) => s.trim().length > 0);
}

export function sentenceAllowed(sentence: string): boolean {
  if (MECHANISM.test(sentence)) return false;
  MARKER_RE.lastIndex = 0;
  const hits = [...sentence.matchAll(MARKER_RE)];
  if (hits.length === 0) return true;
  if (!HAIR_TERMS.test(sentence)) return true; // pure blood fact — allowed
  return !CAUSAL.test(sentence); // separate statements are fine
}

/** Drop every disallowed sentence from a block of AI copy. Paragraph breaks
 *  are preserved; paragraphs emptied by the scrub disappear entirely. */
export function scrubBloodClaims(text: string | null | undefined): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return raw;
  const out: string[] = [];
  for (const para of raw.split(/\n{2,}/)) {
    const kept = splitSentences(para).filter((s) => sentenceAllowed(s));
    const joined = kept.join(" ").trim();
    if (joined) out.push(joined);
  }
  return out.join("\n\n");
}
