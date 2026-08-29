// RELATIONSHIP INTEGRITY — the third guardrail
// ===========================================================================
// 2026-08-29. The two existing guardrails police NOUNS: the closed vocabulary
// check (`hair-vocabulary.ts`) rejects invented terms, and the source lockdown
// (`ingredient-name-lock.ts`, `usage-grounding.ts`) rejects ingredients and
// technique specifics that were never read from a real source.
//
// Neither catches an invented RELATIONSHIP between two real, approved nouns.
// The app shipped "high porosity hair loses oil fast": every word is approved
// vocabulary, every noun is real, and the sentence is scientifically false and
// directly contradicts the manuscript — porosity is about WATER in the strand's
// cuticle, sebum is scalp/skin territory, and the book keeps those two domains
// apart (How To Love Your Afro — Trichology vs Dermatology; Porosity; Moisture).
//
// This module is the ground-truth relationship library plus the validator. It
// is ADDITIVE: it does not read, weaken or replace the vocabulary lockdown,
// the source lockdown or the nullable-fields behaviour. It plugs into the same
// single entry point (`content-integrity.ts`) so every surface that already has
// the first two checks gets this one with no per-function work.
//
// The same rows are mirrored into `public.hair_relationships` (migration
// 20260829_hair_relationships.sql) so the library is queryable by the author
// and the admin tooling, tagged with its manuscript source. This file stays the
// runtime source of truth — the table is the reviewable projection of it.

/** Domains the manuscript keeps deliberately separate. */
export type ConceptDomain = "strand" | "scalp" | "substance" | "measure";

export interface Concept {
  id: string;
  label: string;
  domain: ConceptDomain;
  /** What the concept IS, in the manuscript's terms. */
  definition: string;
  source: string;
}

/** A relationship the manuscript supports (`approved`) or contradicts
 *  (`forbidden`). Forbidden rows carry the detector that finds them in prose. */
export interface Relationship {
  id: string;
  subject: string;
  relation: string;
  object: string;
  polarity: "approved" | "forbidden";
  /** Author-voiced explanation, used verbatim as the retry instruction. */
  reason: string;
  source: string;
}

// ---------------------------------------------------------------------------
// GROUND TRUTH — concepts
// ---------------------------------------------------------------------------

export const CONCEPTS: Concept[] = [
  {
    id: "porosity",
    label: "porosity",
    domain: "strand",
    definition:
      "The cuticle's ability to absorb and release WATER. High porosity = raised cuticle: absorbs moisture easily, loses it easily. Low porosity = tightly closed cuticle: water struggles to get in, but is held well once in.",
    source: "How To Love Your Afro — Porosity",
  },
  {
    id: "density",
    label: "density",
    domain: "measure",
    definition:
      "The number of strands per square inch of scalp — follicle count and spacing. Nothing to do with moisture or oil.",
    source: "How To Love Your Afro — Hair Characteristics",
  },
  {
    id: "elasticity",
    label: "elasticity",
    domain: "strand",
    definition:
      "The hair's ability to stretch and return without breaking — an indicator of strength and of protein–moisture balance.",
    source: "How To Love Your Afro — Hair Characteristics",
  },
  {
    id: "cuticle",
    label: "cuticle",
    domain: "strand",
    definition: "The strand's outer scale layer; how raised or closed it sits is porosity.",
    source: "How To Love Your Afro — Hair Architecture",
  },
  {
    id: "scalp",
    label: "scalp",
    domain: "scalp",
    definition:
      "Skin — epidermis, dermis, hypodermis. Dermatology/trichology territory, a separate category from hair-strand science.",
    source: "How To Love Your Afro — Trichology vs Dermatology",
  },
  {
    id: "sebum",
    label: "sebum",
    domain: "scalp",
    definition:
      "Produced by the sebaceous glands at the follicle; lubricates hair and scalp. Over-oiling can suppress natural sebum production.",
    source: "How To Love Your Afro — Trichology vs Dermatology / Scalp Care",
  },
  {
    id: "scalp_condition",
    label: "scalp condition",
    domain: "scalp",
    definition:
      "Dry or oily scalp, dandruff, eczema, psoriasis, folliculitis — scalp conditions, a different category from porosity, density and elasticity.",
    source: "How To Love Your Afro — Scalp Conditions",
  },
  {
    id: "water",
    label: "water",
    domain: "substance",
    definition: "The only thing that can provide hair with moisture.",
    source: "How To Love Your Afro — Moisture",
  },
  {
    id: "oil",
    label: "oils and butters",
    domain: "substance",
    definition:
      "Soften, coat, seal and slow moisture LOSS. Oils are not moisturisers and do not add moisture.",
    source: "How To Love Your Afro — Moisture / Oils",
  },
  {
    id: "humectant",
    label: "humectants",
    domain: "substance",
    definition:
      "Aloe, glycerine, honey — attract and retain moisture from the atmosphere into the hair.",
    source: "How To Love Your Afro — Moisture",
  },
  {
    id: "emollient",
    label: "emollients",
    domain: "substance",
    definition:
      "Shea butter, coconut oil, mango butter, silicones — fill cuticle gaps, smooth the shaft and lock in existing moisture. They do not add moisture.",
    source: "How To Love Your Afro — Moisture",
  },
  {
    id: "silicone",
    label: "silicones",
    domain: "substance",
    definition:
      "Not inherently bad. Good for dry or porous hair prone to tangling; need proper cleansing to prevent build-up, especially on low-porosity hair.",
    source: "How To Love Your Afro — Ingredient Myths",
  },
  {
    id: "preservative",
    label: "preservatives",
    domain: "substance",
    definition:
      "Necessary and safe at formulated concentrations. \"Natural = no preservatives = better\" is a myth the book explicitly debunks.",
    source: "How To Love Your Afro — Ingredient Myths",
  },
  {
    id: "follicle",
    label: "follicle / root",
    domain: "scalp",
    definition:
      "Sits deep in the dermis. Topical products cannot reach it to stimulate growth unless genuinely medicinal (e.g. minoxidil).",
    source: "How To Love Your Afro — Growth",
  },
];

// ---------------------------------------------------------------------------
// GROUND TRUTH — approved relationships (the only mechanisms copy may assert)
// ---------------------------------------------------------------------------

export const APPROVED_RELATIONSHIPS: Relationship[] = [
  rel("porosity-water", "porosity", "governs absorption and release of", "water", "Porosity describes how readily the cuticle takes in and gives up water.", "How To Love Your Afro — Porosity"),
  rel("high-porosity-loses-water", "high porosity", "loses", "water/moisture quickly", "A raised cuticle absorbs moisture easily and loses it easily.", "How To Love Your Afro — Porosity"),
  rel("low-porosity-resists-water", "low porosity", "resists entry of but holds", "water/moisture", "A tightly closed cuticle makes it hard for water to enter, and holds it well once in.", "How To Love Your Afro — Porosity"),
  rel("density-follicles", "density", "counts", "strands per square inch of scalp", "Density is follicle count and spacing.", "How To Love Your Afro — Hair Characteristics"),
  rel("elasticity-protein-moisture", "elasticity", "indicates", "strength and protein–moisture balance", "Elasticity is the stretch-and-return test of strength.", "How To Love Your Afro — Hair Characteristics"),
  rel("sebum-glands", "sebaceous glands at the follicle", "produce", "sebum", "Sebum comes from the sebaceous glands and lubricates hair and scalp.", "How To Love Your Afro — Trichology vs Dermatology"),
  rel("over-oiling-suppresses-sebum", "over-oiling the scalp", "suppresses", "natural sebum production", "Too much oil on the scalp can suppress the scalp's own sebum production.", "How To Love Your Afro — Scalp Care"),
  rel("water-moisturises", "water", "is the only source of", "moisture", "\"The only thing that can provide our hair with moisture is water.\"", "How To Love Your Afro — Moisture"),
  rel("oil-slows-loss", "oils and butters", "soften, coat, seal and slow the loss of", "moisture already in the hair", "Oils act on water already present; they slow its escape.", "How To Love Your Afro — Moisture"),
  rel("humectant-attracts", "humectants", "attract and retain from the atmosphere", "moisture", "Aloe, glycerine and honey pull moisture from the air into the hair.", "How To Love Your Afro — Moisture"),
  rel("emollient-fills-gaps", "emollients", "fill cuticle gaps, smooth and lock in", "existing moisture", "Emollients smooth the shaft and hold on to moisture already there.", "How To Love Your Afro — Moisture"),
  rel("silicone-detangling", "silicones", "smooth and reduce tangling on", "dry or porous hair", "Silicones suit dry or porous hair prone to tangling, with proper cleansing.", "How To Love Your Afro — Ingredient Myths"),
  rel("silicone-buildup", "silicones", "require proper cleansing to prevent", "build-up", "Build-up, especially on low-porosity hair, is the real consideration — not harm.", "How To Love Your Afro — Ingredient Myths"),
  rel("preservative-safety", "preservatives", "are necessary and safe at", "formulated concentrations", "Preservatives protect the formula; synthetic does not mean unsafe.", "How To Love Your Afro — Ingredient Myths"),
  rel("growth-medicinal-only", "topical products", "cannot reach to stimulate", "the follicle in the dermis", "Only genuinely medicinal actives (e.g. minoxidil) act at the root.", "How To Love Your Afro — Growth"),
];

function rel(
  id: string,
  subject: string,
  relation: string,
  object: string,
  reason: string,
  source: string,
  polarity: "approved" | "forbidden" = "approved",
): Relationship {
  return { id, subject, relation, object, polarity, reason, source };
}

// ---------------------------------------------------------------------------
// GROUND TRUTH — forbidden relationships, with their detectors
// ---------------------------------------------------------------------------

export interface ForbiddenRelationship extends Relationship {
  polarity: "forbidden";
  /** Returns the offending sentence, or null. */
  detect: (sentence: string) => boolean;
}

const POROSITY = /\b(porosity|porous|cuticle)\b/;
const OILY = /\b(oil|oils|oily|sebum|sebaceous|grease|greasy|lipids?|surface lipids?)\b/;
const DENSITY = /\b(density|dense|strand count|follicle count)\b/;
const ELASTICITY = /\b(elasticity|elastic)\b/;
const MOIST = /\b(moisture|moisturis\w+|moisturiz\w+|hydrat\w+|water)\b/;
const SCALP = /\b(scalp|dandruff|eczema|psoriasis|folliculitis|flak\w+)\b/;
const CAUSAL =
  /\b(because|since|so|as a result|means|causes?|caused|leads? to|results? in|makes?|due to|which is why|that is why|thanks to|drives?|affects?|determines?)\b|\b(loses?|losing|lost|produces?|holds?|retains?|strips?)\b/;
const OIL_SUBSTANCE =
  /\b(oil|oils|butter|butters|shea|coconut oil|jojoba|castor|argan|emollient|emollients|silicone|silicones|serum|balm|pomade|grease)\b/;
const ADD_MOISTURE =
  /\b(moisturis\w+|moisturiz\w+|hydrat\w+|adds?\s+moisture|provides?\s+moisture|delivers?\s+moisture|infuses?\s+moisture|replenish\w*\s+moisture|source of moisture)\b/;
const MEDICINAL = /\b(minoxidil|medicinal|prescri\w+|pharmaceutical)\b/;

export const FORBIDDEN_RELATIONSHIPS: ForbiddenRelationship[] = [
  {
    ...rel(
      "porosity-oil-crossing",
      "porosity / cuticle",
      "must never be causally connected to",
      "oil, sebum or scalp oiliness",
      "Porosity is the cuticle's relationship with WATER, and sebum is scalp/skin territory. Connecting them (\"high porosity hair loses oil fast\") is a domain crossing the manuscript keeps apart. Say what porosity does to water, or talk about the scalp separately.",
      "How To Love Your Afro — Porosity; Trichology vs Dermatology",
      "forbidden",
    ),
    polarity: "forbidden",
    detect: (s) => POROSITY.test(s) && OILY.test(s) && CAUSAL.test(s) && !MOIST.test(s.replace(OILY, "")),
  },
  {
    ...rel(
      "porosity-scalp-crossing",
      "porosity / elasticity / density",
      "must never be presented as a property of or cause of",
      "the scalp or a scalp condition",
      "Strand properties (porosity, elasticity, density) and scalp conditions (dryness, oiliness, dandruff, eczema) are separate categories. A strand property never explains a scalp condition.",
      "How To Love Your Afro — Trichology vs Dermatology",
      "forbidden",
    ),
    polarity: "forbidden",
    detect: (s) =>
      (POROSITY.test(s) || DENSITY.test(s) || ELASTICITY.test(s)) &&
      /\b(dandruff|eczema|psoriasis|folliculitis|dry scalp|oily scalp|flaky scalp|scalp dryness|scalp oiliness)\b/.test(s) &&
      CAUSAL.test(s),
  },
  {
    ...rel(
      "density-moisture-crossing",
      "density",
      "must never be causally connected to",
      "moisture or oil behaviour",
      "Density is the number of strands per square inch — follicle count and spacing. It says nothing about how hair holds moisture or oil.",
      "How To Love Your Afro — Hair Characteristics",
      "forbidden",
    ),
    polarity: "forbidden",
    detect: (s) => DENSITY.test(s) && (MOIST.test(s) || OILY.test(s)) && CAUSAL.test(s),
  },
  {
    ...rel(
      "elasticity-moisture-source",
      "elasticity",
      "must never be presented as",
      "a measure of moisture level or oiliness",
      "Elasticity is stretch-and-return: strength and protein–moisture BALANCE. It is not a moisture reading and not a scalp measure.",
      "How To Love Your Afro — Hair Characteristics",
      "forbidden",
    ),
    polarity: "forbidden",
    detect: (s) =>
      ELASTICITY.test(s) &&
      /\b(how much moisture|moisture level|hydration level|oil(?:iness)? level|amount of (?:oil|moisture))\b/.test(s),
  },
  {
    ...rel(
      "oil-as-moisturiser",
      "oils, butters, emollients, silicones",
      "must never be described as",
      "moisturising, hydrating or providing moisture",
      "Only water can give hair moisture. Oils, butters and emollients soften, coat and slow moisture loss — they act on water already in the hair.",
      "How To Love Your Afro — Moisture",
      "forbidden",
    ),
    polarity: "forbidden",
    detect: (s) =>
      OIL_SUBSTANCE.test(s) &&
      ADD_MOISTURE.test(s) &&
      !/\b(slow\w*|reduc\w*|delay\w*|prevent\w*|loss|escap\w*|evaporat\w*|barrier|lock\w*\s+in|seal\w*\s+in|retain\w*)\b/.test(s) &&
      !/\bwater\b[^.]{0,20}\b(only|source)\b/.test(s),
  },
  {
    ...rel(
      "humectant-role-inversion",
      "humectants",
      "must never be described as",
      "sealing or locking moisture in",
      "Humectants (aloe, glycerine, honey) ATTRACT moisture from the atmosphere into the hair. Sealing and locking in is what emollients do.",
      "How To Love Your Afro — Moisture",
      "forbidden",
    ),
    polarity: "forbidden",
    detect: (s) =>
      /\bhumectants?\b|\b(glycerine|glycerin|aloe|honey)\b/.test(s) &&
      /\b(seals?|sealing|locks?|locking|traps?|trapping)\b[^.]{0,30}\b(moisture|water|hydration)\b/.test(s),
  },
  {
    ...rel(
      "emollient-role-inversion",
      "emollients",
      "must never be described as",
      "drawing moisture from the atmosphere",
      "Emollients (shea butter, coconut oil, mango butter, silicones) fill cuticle gaps and hold on to moisture already there. Attracting moisture from the air is what humectants do.",
      "How To Love Your Afro — Moisture",
      "forbidden",
    ),
    polarity: "forbidden",
    detect: (s) =>
      /\b(emollients?|shea butter|mango butter|coconut oil|silicones?)\b/.test(s) &&
      /\b(attract\w*|draw\w*|pull\w*)\b[^.]{0,30}\b(moisture|water)\b[^.]{0,30}\b(air|atmosphere|humidity)?\b/.test(s),
  },
  {
    ...rel(
      "topical-growth-stimulation",
      "topical oils and serums",
      "must never be described as",
      "stimulating growth or reaching the follicle",
      "The root sits too deep in the dermis for a topical product to reach unless it is genuinely medicinal (e.g. minoxidil). A topical oil or serum cannot stimulate growth.",
      "How To Love Your Afro — Growth",
      "forbidden",
    ),
    polarity: "forbidden",
    detect: (s) =>
      !MEDICINAL.test(s) &&
      (/\b(stimulat\w+|boost\w*|trigger\w*|accelerat\w*|promot\w*)\b[^.]{0,40}\b(growth|regrowth)\b/.test(s) ||
        /\b(reach\w*|penetrat\w*|feed\w*|nourish\w*)\b[^.]{0,30}\b(follicle|root|dermis|hair bulb)\b/.test(s)),
  },
  {
    ...rel(
      "silicone-negative-default",
      "silicones",
      "must never be framed as",
      "inherently damaging or bad",
      "Silicones are not inherently bad: they suit dry or porous hair prone to tangling and simply need proper cleansing to avoid build-up, especially on low-porosity hair.",
      "How To Love Your Afro — Ingredient Myths",
      "forbidden",
    ),
    polarity: "forbidden",
    detect: (s) =>
      /\bsilicones?\b|\b(dimethicone|amodimethicone|cyclopentasiloxane)\b/.test(s) &&
      /\b(damag\w+|harmful|harms?|bad for|suffocat\w+|starv\w+|toxic|avoid (?:all|any|these|silicones)|should be avoided|strip\w* the hair)\b/.test(s),
  },
  {
    ...rel(
      "preservative-negative-default",
      "preservatives",
      "must never be framed as",
      "harmful, or as something a \"natural\" formula is better without",
      "Preservatives are necessary and safe at formulated concentrations. \"Natural means no preservatives, which is better\" is a myth the book explicitly debunks.",
      "How To Love Your Afro — Ingredient Myths",
      "forbidden",
    ),
    polarity: "forbidden",
    detect: (s) =>
      /\b(preservatives?|paraben\w*|phenoxyethanol)\b/.test(s) &&
      /\b(harmful|harms?|damag\w+|toxic|irritat\w+ by design|best avoided|should be avoided|preservative[- ]free is|better without)\b/.test(s),
  },
  {
    ...rel(
      "sebum-porosity-production",
      "sebum production",
      "must never be attributed to",
      "a strand property",
      "Sebum production is a scalp/skin function of the sebaceous glands. Porosity, density and elasticity do not raise or lower it.",
      "How To Love Your Afro — Trichology vs Dermatology",
      "forbidden",
    ),
    polarity: "forbidden",
    detect: (s) =>
      /\b(sebum|oil)\s+production\b/.test(s) &&
      (POROSITY.test(s) || DENSITY.test(s) || ELASTICITY.test(s)),
  },
];

export const ALL_RELATIONSHIPS: Relationship[] = [
  ...APPROVED_RELATIONSHIPS,
  ...FORBIDDEN_RELATIONSHIPS.map(({ detect: _detect, ...r }) => r),
];

// ---------------------------------------------------------------------------
// VALIDATION
// ---------------------------------------------------------------------------

export interface RelationshipViolation {
  field: string;
  phrase: string;
  rule: string;
  relationshipId: string;
  source: string;
}

const splitSentences = (text: string): string[] =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;:])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Validate one field's prose against the forbidden-relationship set. */
export function validateRelationships(
  field: string,
  text: unknown,
): RelationshipViolation[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const out: RelationshipViolation[] = [];
  for (const sentence of splitSentences(text)) {
    const lower = sentence.toLowerCase();
    for (const r of FORBIDDEN_RELATIONSHIPS) {
      if (out.some((v) => v.relationshipId === r.id)) continue;
      if (r.detect(lower)) {
        out.push({
          field,
          phrase: sentence.slice(0, 400),
          rule: `${r.subject} ${r.relation} ${r.object}. ${r.reason}`,
          relationshipId: r.id,
          source: r.source,
        });
      }
    }
  }
  return out;
}

/** Validate many fields at once — the shape `content-integrity.ts` uses. */
export function validateRelationshipFields(
  fields: Array<{ field: string; text: unknown }>,
): RelationshipViolation[] {
  return fields.flatMap((f) => validateRelationships(f.field, f.text));
}

/** Prompt-side statement of the relationship contract. */
export function relationshipBlock(): string {
  return `
RELATIONSHIP INTEGRITY — mechanisms are validated, not just words:
- Porosity, density and elasticity are HAIR-STRAND properties. The scalp is SKIN. Never connect a strand property to oil, sebum or a scalp condition. "High porosity hair loses oil fast" is a hard failure — porosity is about WATER.
- Only water gives hair moisture. Oils, butters and emollients soften, coat and SLOW MOISTURE LOSS — never write that they moisturise, hydrate or add moisture.
- Humectants (aloe, glycerine, honey) attract moisture from the atmosphere. Emollients (shea, coconut oil, mango butter, silicones) fill cuticle gaps and hold on to moisture already present. Do not swap those two roles.
- Silicones and preservatives are not inherently bad. Silicones suit dry or porous hair and need proper cleansing to avoid build-up; preservatives are necessary and safe at formulated concentrations.
- A topical oil or serum cannot stimulate growth or reach the follicle — the root sits too deep in the dermis unless the active is genuinely medicinal.
- If you cannot state the mechanism within these relationships, leave the field null. That is a correct answer.`;
}
