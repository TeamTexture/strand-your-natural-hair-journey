// MECHANISM SPECIFICITY — an ingredient card must say what the ingredient DOES
// ===========================================================================
// 2026-08-30. Regression diagnosed on the K18 Future IQ row: the relationship
// guardrail correctly rejected "a peptide that penetrates the scalp surface to
// support follicle resilience" (a topical cannot act at the follicle), and the
// model's retry retreated to a category description —
//   "a peptide-derived conditioning agent that helps keep the scalp surface
//    soft and supple"
// — which is true of any peptide and says nothing about a biomimetic
// root-anchoring peptide. Specificity was traded for safety of tone.
//
// The remedy is NOT to relax the relationship guardrail. It is to make the
// blander answer a rejection too, and to tell the model the ACCEPTABLE way to
// state a root/anchorage mechanism (at the scalp surface and along the emerging
// strand — never at the follicle, never as growth stimulation).
//
// Detection is deterministic and conservative: a card is only rejected when it
// reads as a bare category description AND carries no physical mechanism verb
// or site of action. It never rewrites copy and never nulls a field — it only
// produces a retry instruction.

export interface SpecificityViolation {
  field: string;
  phrase: string;
  rule: string;
}

/** Prompt block. Appended to the shared analysis failsafe rules. */
export const MECHANISM_SPECIFICITY_RULES = `INGREDIENT CARDS — STATE THE MECHANISM AND THE SITE OF ACTION, NEVER A CATEGORY:
Each ingredient body must say what THAT molecule physically does and WHERE it does it. A category description that would be true of every member of the family is a failed answer and will be rejected.
- REJECTED: "a peptide-derived conditioning agent that helps keep the scalp surface soft and supple", "an amino acid derivative that acts as a conditioning agent", "a conditioning agent that improves the feel of hair", "provides conditioning benefits".
- REQUIRED: the specific action — what it binds to, buffers, dissolves, emulsifies, coats, chelates, cleanses, softens, donates, thickens, or holds water against — plus the surface it acts on (the strand's cuticle, the cortex, the scalp surface, the emerging strand at the root area).
- Named functional molecules (biomimetic peptides, dipeptides, cysteinates, hydrolysed proteins, ceramides, bond-building actives) are the formula's HEADLINE actives. Describe their real documented mechanism specifically — for example a biomimetic peptide that binds to keratin at the strand surface, or a cysteine-donating amino acid derivative that supports the strand's protein structure where it emerges at the scalp.
- HOW TO SAY ROOT / ANCHORAGE WORK LEGITIMATELY: a topical never reaches the follicle and never stimulates growth (that claim is rejected outright). Say instead that it works at the SCALP SURFACE and on the EMERGING STRAND at the root area — that is where a topical acts, and it is what makes it relevant to recorded concerns at the edges, hairline, temples, crown or nape.
- Never soften a real mechanism into generic conditioning language to stay safe. Specific and honest beats vague and comfortable, every time.`;

/** Category-only templates — true of the whole family, specific to nothing. */
const GENERIC_TEMPLATES: RegExp[] = [
  /\b(?:a|an)\s+[a-z-]*\s*(?:derived|based)?\s*conditioning agent\b/i,
  /\bacts? as a conditioning agent\b/i,
  /\bprovides? conditioning (?:benefits|properties)\b/i,
  /\bhelps? (?:to )?(?:keep|leave|make)\b[^.]{0,40}\b(?:soft|supple|smooth|healthy|comfortable|manageable)\b/i,
  /\bimproves? the (?:feel|look|condition) of\b/i,
  /\bsupports? (?:overall|general|healthy)\b/i,
  /\bhelps? (?:to )?(?:soothe and condition|condition and soothe)\b/i,
  /\bgood for (?:the )?(?:hair|scalp)\b/i,
  /\bhelps? maintain (?:healthy|overall)\b/i,
];

/** A real physical action. Any one of these is enough to pass. */
const MECHANISM_VERBS: RegExp[] = [
  /\bbinds?\b/i,
  /\bbonds?\b/i,
  /\bdonat/i,
  /\battach/i,
  /\bbuffers?\b/i,
  /\badjusts? (?:the )?ph\b/i,
  /\bdissolv/i,
  /\bsolubilis|\bsolubiliz/i,
  /\bemulsif/i,
  /\bchelat/i,
  /\bcleanse|\blifts? (?:sebum|oil|build-up)/i,
  /\bcoats?\b/i,
  /\bseals?\b/i,
  /\bslows? (?:water|moisture) loss\b/i,
  /\bdraws? water\b|\battracts? water\b|\bholds? water\b/i,
  /\bthickens?\b/i,
  /\bsuspends?\b/i,
  /\bpreserv|\binhibits? (?:microbial|bacterial|fungal)/i,
  /\bcarrier\b|\bsolvent\b/i,
  /\bsoftens? (?:the )?cuticle\b/i,
  /\breduces? friction\b|\bslip\b/i,
  /\bregulat(?:es|ing) (?:sebum|surface oil)\b/i,
  /\bantioxidant\b|\bneutralis|\bneutraliz/i,
  /\bprotein structure\b|\bkeratin\b|\bdisulfide\b|\bcysteine\b|\bpeptide chain\b|\bamino acid chain\b/i,
];

/** Sites of action that make a claim concrete. */
const SITE_MARKERS: RegExp[] = [
  /\bcuticle\b/i,
  /\bcortex\b/i,
  /\bstrand\b/i,
  /\bscalp surface\b/i,
  /\bsurface of the (?:hair|strand|scalp)\b/i,
  /\bhair shaft\b/i,
  /\bformula\b/i,
  /\bwater phase\b/i,
  /\bemerging strand\b/i,
];

const isGenericText = (text: string): boolean => {
  const t = (text ?? "").trim();
  if (!t) return false;
  const generic = GENERIC_TEMPLATES.some((re) => re.test(t));
  if (!generic) return false;
  // A card that also states a real action and a site is specific enough.
  const hasMechanism = MECHANISM_VERBS.some((re) => re.test(t));
  const hasSite = SITE_MARKERS.some((re) => re.test(t));
  return !(hasMechanism && hasSite);
};

/** Public predicate — used by the tests and by the analysis surfaces. */
export function isGenericMechanism(text: unknown): boolean {
  return typeof text === "string" && isGenericText(text);
}

/** Ingredients whose mechanism is documented and specific: a category-only
 *  description of one of these is always a rejection. */
const HEADLINE_ACTIVE = /\b(?:peptide|dipeptide|tripeptide|tetrapeptide|cysteinate|cysteine|keratin|hydrolyz(?:ed|ised)|hydrolysed|ceramide|niacinamide|panthenol|caffeine|biotin|amino acid)\b/i;

/**
 * Validates ingredient cards (`{ name, body }` or `{ name, benefit }`) and any
 * extra prose fields. Returns retry instructions — never mutations.
 */
export function validateMechanismSpecificity(
  cards: unknown,
  fieldName = "ingredients",
): SpecificityViolation[] {
  if (!Array.isArray(cards)) return [];
  const out: SpecificityViolation[] = [];
  cards.forEach((raw, i) => {
    if (!raw || typeof raw !== "object") return;
    const row = raw as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : "";
    const key = typeof row.body === "string" ? "body" : "benefit";
    const text = typeof row[key] === "string" ? (row[key] as string) : "";
    if (!text) return;
    const generic = isGenericText(text);
    if (!generic) return;
    // Only the family-level filler is rejected. A headline active gets a
    // sharper instruction naming itself.
    out.push({
      field: `${fieldName}[${i}].${key}`,
      phrase: text.slice(0, 200),
      rule: HEADLINE_ACTIVE.test(name)
        ? `"${name}" is a headline functional active and its description is a category label, not a mechanism ("${text.slice(0, 90)}"). State what this molecule specifically does and where — what it binds to or donates, and the surface it acts on (strand cuticle, cortex, scalp surface, emerging strand at the root area). A topical never reaches the follicle and never stimulates growth: say scalp surface / emerging strand instead. Do not fall back to "conditioning agent".`
        : `${fieldName}[${i}] describes "${name}" with a generic category phrase ("${text.slice(0, 90)}") instead of its mechanism. Say what the molecule physically does (binds, buffers, emulsifies, chelates, cleanses, coats, holds water, preserves, thickens) and the surface it acts on.`,
    });
  });
  return out;
}
