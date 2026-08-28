// CLOSED HAIR/SCALP VOCABULARY — post-generation validation
// =========================================================
// 2026-08-28, after a member was shown "high porosity scalp" in a product
// analysis. Porosity is a property of the hair CUTICLE. It is not a property
// of skin, so "porosity scalp" / "scalp porosity" is not a real concept — it
// is two real manuscript terms welded into an invented one.
//
// This module is the structural failsafe: an explicit approved-terminology
// list, sourced from the manuscript content already loaded in the app
// (`_shared/knowledge/topics/*` — porosity, hair-architecture,
// scalp-conditions, protein-and-strengthening, heat-and-moisture,
// wash-day-mechanics — plus the `manuscript_terminology` lexicon), with each
// term tagged by the DOMAIN the manuscript reserves it for.
//
// Two checks run on generated copy:
//   1. DOMAIN CROSSING — a strand-only term paired with a scalp/skin word
//      (or the reverse) in the same noun phrase. This is what produced
//      "high porosity scalp".
//   2. UNKNOWN TECHNICAL TERM — a word that looks like hair/scalp science
//      (matches a known root family) but is not on the approved list.
//
// Anything flagged is REJECTED — the generation is re-asked, and if it still
// fails the offending field is nulled. It is never shown to the member.

export type TermDomain = "strand" | "scalp" | "both";

export interface ApprovedTerm {
  term: string;
  domain: TermDomain;
}

/** The approved list. Every entry is a concept the manuscript actually teaches. */
export const APPROVED_HAIR_TERMS: ApprovedTerm[] = [
  // ── Strand / cuticle properties (Ch.8 "Your Hair – The Basics") ──
  { term: "porosity", domain: "strand" },
  { term: "low porosity", domain: "strand" },
  { term: "high porosity", domain: "strand" },
  { term: "medium porosity", domain: "strand" },
  { term: "cuticle", domain: "strand" },
  { term: "cuticle scales", domain: "strand" },
  { term: "cuticle layers", domain: "strand" },
  { term: "cortex", domain: "strand" },
  { term: "elasticity", domain: "strand" },
  { term: "strand diameter", domain: "strand" },
  { term: "surface texture", domain: "strand" },
  { term: "curl pattern", domain: "strand" },
  { term: "curl diameter", domain: "strand" },
  { term: "coil", domain: "strand" },
  { term: "kink", domain: "strand" },
  { term: "strand", domain: "strand" },
  { term: "hair shaft", domain: "strand" },
  { term: "mid-shaft", domain: "strand" },
  { term: "ends", domain: "strand" },
  { term: "split ends", domain: "strand" },
  { term: "lengths", domain: "strand" },
  { term: "protein balance", domain: "strand" },
  { term: "protein overload", domain: "strand" },
  { term: "moisture retention", domain: "strand" },
  { term: "moisture loss", domain: "strand" },
  { term: "shrinkage", domain: "strand" },
  { term: "breakage", domain: "strand" },
  { term: "length retention", domain: "strand" },
  { term: "build-up", domain: "strand" },
  { term: "slip", domain: "strand" },
  { term: "heat damage", domain: "strand" },

  // ── Scalp / skin properties (Ch. scalp conditions) ──
  { term: "scalp", domain: "scalp" },
  { term: "scalp condition", domain: "scalp" },
  { term: "scalp health", domain: "scalp" },
  { term: "scalp barrier", domain: "scalp" },
  { term: "sebum", domain: "scalp" },
  { term: "sebum production", domain: "scalp" },
  { term: "follicle", domain: "scalp" },
  { term: "hair follicle", domain: "scalp" },
  { term: "flaking", domain: "scalp" },
  { term: "dandruff", domain: "scalp" },
  { term: "irritation", domain: "scalp" },
  { term: "itchiness", domain: "scalp" },
  { term: "seborrheic dermatitis", domain: "scalp" },
  { term: "eczema", domain: "scalp" },
  { term: "psoriasis", domain: "scalp" },
  { term: "folliculitis", domain: "scalp" },
  { term: "hairline", domain: "scalp" },
  { term: "edges", domain: "scalp" },
  { term: "partings", domain: "scalp" },
  { term: "shedding", domain: "scalp" },
  { term: "density", domain: "scalp" },
  { term: "low density", domain: "scalp" },
  { term: "high density", domain: "scalp" },
  { term: "medium density", domain: "scalp" },
  { term: "traction alopecia", domain: "scalp" },
  { term: "alopecia", domain: "scalp" },

  // ── Formulation / mechanism terms (apply to either) ──
  { term: "humectant", domain: "both" },
  { term: "emollient", domain: "both" },
  { term: "occlusive", domain: "both" },
  { term: "surfactant", domain: "both" },
  { term: "anionic surfactant", domain: "both" },
  { term: "cationic", domain: "both" },
  { term: "silicone", domain: "both" },
  { term: "chelator", domain: "both" },
  { term: "preservative", domain: "both" },
  { term: "emulsifier", domain: "both" },
  { term: "antioxidant", domain: "both" },
  { term: "botanical extract", domain: "both" },
  { term: "ph", domain: "both" },
  { term: "protein", domain: "both" },
  { term: "hydrolysed protein", domain: "both" },
  { term: "conditioning agent", domain: "both" },
  { term: "clarifying", domain: "both" },
];

const APPROVED_SET = new Set(APPROVED_HAIR_TERMS.map((t) => t.term.toLowerCase()));

const STRAND_ONLY = APPROVED_HAIR_TERMS.filter((t) => t.domain === "strand").map((t) => t.term);
const SCALP_WORDS = ["scalp", "skin", "follicle", "follicles", "sebum", "pores", "pore", "scalps"];
const STRAND_WORDS = ["strand", "strands", "cuticle", "cuticles", "shaft", "hair shaft", "cortex"];
const SCALP_ONLY_PROPERTIES = ["sebum production", "flaking", "dandruff", "folliculitis"];

/**
 * Technical roots that mark a phrase as hair/scalp science. A term built on one
 * of these roots must appear on the approved list — otherwise it is an
 * invented concept and gets rejected.
 */
const TECHNICAL_ROOTS = [
  "porosity",
  "porous",
  "elasticity",
  "cuticle",
  "cortex",
  "medulla",
  "sebum",
  "follicle",
  "keratinis",
  "keratiniz",
  "tricholog",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sentencesOf = (text: string): string[] =>
  text.replace(/\s+/g, " ").split(/(?<=[.!?;])\s+/).map((s) => s.trim()).filter(Boolean);

export interface VocabularyViolation {
  /** Where it was found — a dotted field path. */
  field: string;
  /** The offending phrase. */
  phrase: string;
  /** Retry instruction handed back to the model. */
  rule: string;
}

/**
 * Domain-crossing check: a strand-only property used as if it belonged to the
 * scalp (or vice versa), within the same short noun phrase. Catches
 * "high porosity scalp", "scalp porosity", "the porosity of your scalp",
 * "follicle elasticity", "cuticle of the scalp".
 */
function domainCrossings(text: string): string[] {
  const hits: string[] = [];
  const gap = "(?:\\s+\\w+){0,3}\\s+"; // up to 3 filler words ("of your", "on the")
  for (const term of [...STRAND_ONLY, ...STRAND_WORDS]) {
    const t = escape(term.toLowerCase());
    for (const scalpWord of SCALP_WORDS) {
      const s = escape(scalpWord);
      const patterns = [
        new RegExp(`\\b${t}${gap}${s}\\b`, "i"),
        new RegExp(`\\b${s}${gap}${t}\\b`, "i"),
        new RegExp(`\\b${t}\\s+${s}\\b`, "i"),
        new RegExp(`\\b${s}\\s+${t}\\b`, "i"),
      ];
      for (const re of patterns) {
        const m = text.match(re);
        if (m) hits.push(m[0]);
      }
    }
  }
  for (const prop of SCALP_ONLY_PROPERTIES) {
    for (const strandWord of STRAND_WORDS) {
      const re = new RegExp(`\\b(?:${escape(prop)}\\s+${escape(strandWord)}|${escape(strandWord)}\\s+${escape(prop)})\\b`, "i");
      const m = text.match(re);
      if (m) hits.push(m[0]);
    }
  }
  return [...new Set(hits)];
}

/**
 * Unknown-technical-term check: a phrase built on a hair-science root that is
 * not on the approved list, e.g. "scalp porosity", "follicular elasticity".
 */
function unknownTechnicalTerms(text: string): string[] {
  const hits: string[] = [];
  for (const root of TECHNICAL_ROOTS) {
    const re = new RegExp(`\\b(\\w+\\s+)?(${escape(root)}\\w*)(\\s+\\w+)?\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const before = (m[1] ?? "").trim().toLowerCase();
      const core = m[2].toLowerCase();
      const after = (m[3] ?? "").trim().toLowerCase();
      // Bare root, or root with an approved qualifier, is fine.
      if (APPROVED_SET.has(core)) {
        if (before && APPROVED_SET.has(`${before} ${core}`)) continue;
        if (after && SCALP_WORDS.includes(after)) hits.push(`${core} ${after}`);
        continue;
      }
      // A morphological variant of an approved root ("porous", "follicular",
      // "trichologist") is allowed; a compound with a body-part word is not.
      const rootedOnApproved = APPROVED_HAIR_TERMS.some((t) => core.startsWith(t.term.split(" ")[0]));
      if (!rootedOnApproved) hits.push(core);
      else if (before && SCALP_WORDS.includes(before)) hits.push(`${before} ${core}`);
    }
  }
  return [...new Set(hits)];
}

/** Validate one field's copy. Returns zero or more violations. */
export function validateHairTerminology(field: string, text: unknown): VocabularyViolation[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const out: VocabularyViolation[] = [];
  for (const sentence of sentencesOf(text)) {
    for (const phrase of domainCrossings(sentence)) {
      out.push({
        field,
        phrase,
        rule:
          `"${phrase}" in ${field} mixes a hair-strand property with a scalp/skin word. ` +
          `Porosity, elasticity, cuticle and curl pattern describe the HAIR STRAND only — they are never properties of the scalp, skin, follicles or sebum. ` +
          `Rewrite using the correct domain, or return null for this field.`,
      });
    }
    for (const phrase of unknownTechnicalTerms(sentence)) {
      out.push({
        field,
        phrase,
        rule:
          `"${phrase}" in ${field} is not approved STRAND terminology. ` +
          `Use only terms the app already teaches (porosity, cuticle, elasticity, strand diameter, surface texture, curl pattern, density, scalp condition, sebum, follicle, moisture retention, protein balance, build-up, length retention). ` +
          `Never invent a compound term. If no approved term fits, return null for this field.`,
      });
    }
  }
  return out;
}

/** Walks a set of named fields and validates each. */
export function validateTerminologyFields(
  fields: Array<{ field: string; text: unknown }>,
): VocabularyViolation[] {
  return fields.flatMap((f) => validateHairTerminology(f.field, f.text));
}
