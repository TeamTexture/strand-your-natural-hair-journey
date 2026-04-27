import type { Topic } from "../types.ts";

// SAFETY-CRITICAL TOPIC. Sourced strictly from the STRAND manuscript,
//, pp 126–130 (the comprehensive
// list of conditions a trichologist or dermatologist diagnoses) and
//, pp 151–153 (Paige's elaboration of
// traction alopecia, CCCA, seborrheic dermatitis). No clinical detail
// is improvised — every statement traces to one of these passages.
// Persona: never give medical diagnoses; always defer to professional.

export const DIAGNOSED_CONDITIONS: Topic = {
 id: "diagnosed-conditions",
 title: "Diagnosed Conditions of the Hair and Scalp",
 body: `These are conditions a trichologist or dermatologist diagnoses — not the AI, not the user, and never STRAND. The only role here is to recognise the names accurately when they appear in a user's profile and frame what the manuscript has to say about them.

Hair-loss conditions covered in the manuscript:

— Traction alopecia. Hair loss caused by repeated pulling or tension on the follicles. Tight braids, buns, extensions, weaves, cornrows or ponytails styled with too much pulling, with constant pressure on the scalp, can lead to eventual hair loss due to damage at the hair's root. This was the type of alopecia Paige had. Caught early, new healthy hair can grow back.

— CCCA (Central centrifugal cicatricial alopecia). A form of scarring alopecia that primarily affects the central scalp area. Inflammation and destruction of hair follicles lead to hair loss and scarring. Predominantly seen in women of African descent. The exact cause isn't fully known but is thought to be linked to genetics and inflammation; lack of proper scalp care or tight styles may worsen it.

— Androgenetic alopecia. Male-pattern baldness and female-pattern hair loss.

— Alopecia areata. An autoimmune condition causing patchy hair loss.

— Telogen effluvium. Temporary hair loss caused by stress, illness, or other factors. The book is direct that stress hormones can disrupt the hair growth cycle and push more hairs into the shedding (telogen) phase.

Scalp conditions covered in the manuscript:

— Seborrheic dermatitis (also called dandruff in a milder form). A common, non-contagious skin condition that causes itchy red patches and greasy scales, with white or yellow crusty or powdery flakes. Often triggered by overproduction of sebum or sensitivity to oils — naturally produced or applied — that disrupt the scalp's balance. Get assessed by a dermatologist as soon as possible.

— Psoriasis. A skin condition causing red, scaly patches.

— Eczema. Inflammation of the skin, often present on the scalp as itchiness, redness, inflammation and sometimes oozing.

— Folliculitis (and pseudofolliculitis). Inflammation of hair follicles, often caused by use of unclean clippers on the skin; presents as bumps or pustules on the scalp.

What the AI does when one of these is in the user's profile:

— Acknowledge it accurately by name. Don't paraphrase or downgrade.
— Frame product / wash-day / styling advice around protecting the diagnosis.
— Defer interpretation, treatment, and any change in clinical management to the user's trichologist, dermatologist or GP — never STRAND.
— For traction-style risks, lean into the manuscript's low-tension / low-manipulation guidance.

If you find a dermatologist with an educational background in Afro and curly hair, even better — a specialist trained in textured hair has a deeper understanding of the structures, the conditions Black women are more prone to, and how porosity, density and elasticity influence scalp and hair health.`,
 // Matching strategy: this topic surfaces via `health.conditions` only.
 // Although diagnosed conditions are physically stored on
 // `user_hair_profile.diagnosed_conditions`, the AI context layer
 // (selector_context.health.conditions in the prompt builder) folds those
 // entries into the health.conditions array. Single source of truth at
 // selection time — the selector then matches against this declared list.
 applies_to: {
 health: {
 conditions: [
 "Traction alopecia",
 "Androgenetic alopecia",
 "Alopecia areata",
 "CCCA",
 "Telogen effluvium",
 "Seborrheic dermatitis",
 "Folliculitis",
 "Scalp psoriasis",
 "Scalp eczema",
 "Alopecia",
 ],
 },
 function_kinds: [
 "ingredient-analysis",
 "product-analyse",
 "product-analyse-url",
 "wash-day-observation",
 "heat-treatment-rationale",
 "blood-ai-summary",
 "nutrition-plan",
 ],
 },
 book_refs: [
 {
 chapter: 9,
 chapter_title: "Trichology vs Dermatology",
 page_start: 126,
 page_end: 130,
 },
 {
 chapter: 12,
 chapter_title: "Scalp Health First",
 page_start: 151,
 page_end: 153,
 },
 ],
 tags: [
 "alopecia",
 "traction-alopecia",
 "CCCA",
 "androgenetic",
 "alopecia-areata",
 "telogen-effluvium",
 "seborrheic-dermatitis",
 "psoriasis",
 "eczema",
 "folliculitis",
 "safety-critical",
 ],
};
