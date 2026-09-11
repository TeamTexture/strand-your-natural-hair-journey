// context-priority — per-surface guidance telling each generation which of the
// member's recorded data points to weigh FIRST for that kind of analysis.
//
// Why this exists: buildAiContext() now ships 30+ data points on every call.
// Without an ordering the models kept reasoning about porosity alone because it
// was the first familiar field they recognised. These blocks are PROMPT ONLY —
// no schema, no scoring maths, no extra model calls. Every existing guardrail
// still runs on the output afterwards.
//
// HARD BOUNDARIES kept intact here (do not "improve" them back):
//  • Blood markers are stated factually; a marker is NEVER causally bridged to a
//    hair outcome (see _shared/blood-guardrail.ts) — prioritisation only.
//  • Nutrition never states doses, injections or infusions; food first.
//  • Style is a QUANTITY (duration worn, scalp access, coverage), never a
//    technique, teaching or verdict (see _shared/style-weighting.ts).
//  • An absent field means "not established" — never a zero, never a hedge.

export type PrioritySurface =
  | "product-analyse"
  | "ingredient-analysis"
  | "blood-ai-summary"
  | "nutrition-plan"
  | "wash-day-observation"
  | "heat-treatment-rationale";

const AVAILABLE = `WHAT YOU HAVE BEEN GIVEN (any field may be absent — absent means NOT ESTABLISHED, never zero, and must never be named, hedged or guessed at):
hairProfile (curl pattern, strand diameter, surface texture, density, porosity, elasticity, scalp condition, diagnosed conditions, areas of concern, length) · currentStyle (current hairstyle, days in style, planned next style, usual styles, colour status, chemical history) · healthProfile (life stage, contraception, medical conditions, diet, water, exercise, sleep, smoking, alcohol, medications) · goals and challenges · bloodPanels / bloodResults · behaviour (wash count, wash frequency, wash consistency, average gap, heat frequency, air-dry percentage, breakage severity) · recentProductsUsed · shelf, tools and ratings · sensitivities · professional (type, consultation date, recommendations) · location (postcode, country, water hardness) · demographics (heritage, age).`;

const CUMULATIVE = `CUMULATIVE STRESS: weigh the stack, not one field. Several stressors together (fragile chemical history + frequent heat + a long-worn style + high recorded breakage) mean a much higher moisture need and much lower tolerance for anything drying or protein-heavy than any one of them alone would suggest.`;

const NO_SINGLE_FIELD = `NEVER let one recorded characteristic carry the whole answer. Porosity is one input among many and the order fields appear in the payload means nothing. If your reasoning names only porosity, you have not used what she gave you.`;

const BLOCKS: Record<PrioritySurface, string> = {
  "product-analyse": `INTELLIGENT SELECTION — WHICH DATA POINTS DECIDE THIS PRODUCT
${AVAILABLE}

Weigh them for THIS product analysis in this order:
1. Chemical history (relaxers, permanent colour, texturisers, keratin/permanent treatments) — a compromised protein structure is the single biggest driver of what this formula will do. Let it move match_score.
2. Current hairstyle and how long it has been worn — manipulation, tension and scalp access change what she can realistically apply, and whether protein or moisture is the need. State the style as recorded fact only, never as technique or verdict.
3. Hair characteristics (strand diameter, density, elasticity, surface texture) — protein/moisture balance for THIS hair, not hair in general.
4. Diagnosed conditions and recorded sensitivities (seborrhoeic dermatitis, scalp psoriasis, alopecia, declared allergies) — caution and sensitivity flags.
5. Porosity plus her goals and challenges — general fit.
6. Blood markers and medications — only where a genuine ingredient interaction exists. Rare, but decisive when real. State a marker factually; never claim it causes a hair outcome.

${CUMULATIVE}
${NO_SINGLE_FIELD}
Scoring, direction and sensitivity rules are unchanged: match_score stays 0-100 on formulation quality and safety, every score reason carries its direction, and a declared sensitivity still caps the score.`,

  "ingredient-analysis": `INTELLIGENT SELECTION — WHICH DATA POINTS DECIDE THIS INGREDIENT LIST
${AVAILABLE}

Weigh them for THIS ingredient analysis in this order:
1. Porosity and her water-retention goals — what the formula has to hold onto.
2. The challenges she actually wrote down (breakage, dryness, shedding, build-up, frizz, heat damage) — match each to the role the ingredient plays.
3. Diagnosed conditions, allergies and recorded sensitivities — caution flags.
4. Chemical history (relaxer, colour, permanent treatments) — how fragile the strand already is.
5. Current hairstyle and days in style — manipulation load and how much of the scalp she can reach. Recorded fact only.
6. Climate, water hardness and wash consistency — environmental load.
7. Blood markers — factual mention only, never bridged causally to hair.

Be specific rather than categorical. Say what the molecule does, then name the recorded signal it lands on ("this is a strong protein, which is why it suits the breakage you logged after colour and frequent heat — watch build-up given the scalp condition on file").
${CUMULATIVE}
${NO_SINGLE_FIELD}
Output fields and rules are unchanged.`,

  "blood-ai-summary": `INTELLIGENT SELECTION — WHICH DATA POINTS SHAPE THIS PANEL SUMMARY
${AVAILABLE}

Weigh them in this order when deciding what to REPORT and in what order:
1. Iron and ferritin, B12 and folate, vitamin D — report every one that sits outside range first, with its value and range.
2. Thyroid markers and hormones.
3. Magnesium, zinc and the remaining minerals and vitamins.
4. Lifestyle on file (diet, exercise, sleep, alcohol, smoking) — for the food-first dietary steer only.
5. Medications and contraception — flag where a GP conversation is the right next step.
6. Recorded medical conditions.
7. Climate and water on file.

ABSOLUTE, UNCHANGED: a marker is reported as a FACT — the marker, its value with unit, its range, whether it sits inside or outside, and a GP conversation when outside. You may NOT connect any marker to hair, breakage, shedding, follicles or growth, and you may NOT state a mechanism. No causal connectors. Prioritisation decides ORDER and COVERAGE only, never the addition of a hair claim.
${NO_SINGLE_FIELD}`,

  "nutrition-plan": `INTELLIGENT SELECTION — WHICH DATA POINTS SHAPE THIS NUTRITION PLAN
${AVAILABLE}

Weigh them in this order:
1. Markers outside range, iron/ferritin, B12, folate and vitamin D first, then thyroid and hormones, then magnesium and zinc.
2. Her diet pattern — vegan, vegetarian, pescatarian, omnivore, other or unknown. Substitute, never subtract, and always give plant-based options.
3. Absorption and interaction context: recorded conditions, medications and contraception — and the pairings that help or hinder a nutrient (vitamin C alongside plant iron; iron away from tea, coffee and calcium at the same sitting).
4. Wash behaviour and the products she actually used — frequent cleansing and protein treatments change which everyday foods are worth leaning on.
5. Professional recommendations on file — if her professional flagged a need, honour it.
6. Adherence: a few high-impact everyday changes beat a long stack she will not keep up.

UNCHANGED AND ABSOLUTE: food before supplements. Never state a dose, quantity, strength, unit or duration, and never mention injections, infusions or any clinical treatment. Never name at-risk groups. Anything beyond food is a GP conversation.
${NO_SINGLE_FIELD}`,

  "wash-day-observation": `INTELLIGENT SELECTION — WHICH DATA POINTS SHAPE THIS WASH-DAY REFLECTION
${AVAILABLE}

Weigh them in this order:
1. Recorded breakage across recent washes — is it rising or settling, and what did she use on those days?
2. What she actually used today (protein, moisture, scalp step, heat while conditioning) against the state her hair is in.
3. Her goals and challenges — did today move her toward them?
4. Current style and how long it has been worn, plus anything planned next. Recorded fact only, never technique or a cadence.
5. Chemical history — colour or relaxed lengths need protecting.
6. Climate and water hardness.
7. Wash rhythm — her own recorded frequency and consistency, not a prescribed one.
8. Blood markers — factual only, never bridged to what she felt today.

${NO_SINGLE_FIELD}
Output fields and every existing rule are unchanged.`,

  "heat-treatment-rationale": `INTELLIGENT SELECTION — WHICH DATA POINTS DECIDE HEAT FOR HER TODAY
${AVAILABLE}

Weigh them in this order:
1. Chemical history — relaxed or colour-treated lengths have a compromised protein structure, so warmth carries more risk.
2. Elasticity on file — low elasticity is the strongest single reason to hold back.
3. Recorded breakage severity — already high means caution, not encouragement.
4. Porosity and moisture retention.
5. Her goal — does warmth under a deep conditioner actually serve it?
6. Current style and wash rhythm — recorded fact only.
7. Blood markers — factual mention only, never a causal claim about recovery or growth.

Where the picture is intact (elasticity on file, no fragile chemical history, breakage low), say plainly that warmth helps the conditioner sit deeper. Where it is fragile (low elasticity, recent relaxer or colour, high recorded breakage), lead with the caution and give the gentler alternative instead. The only heat tool you may name remains the TT Heat Hat.
${NO_SINGLE_FIELD}
Output fields are unchanged.`,
};

/** The prioritisation guidance for one surface. Prompt text only. */
export function contextPriorityBlock(surface: PrioritySurface): string {
  return BLOCKS[surface];
}

/** Ready to append to an existing system prompt / task-instruction string. */
export function contextPrioritySuffix(surface: PrioritySurface): string {
  return `\n\n${BLOCKS[surface]}`;
}
