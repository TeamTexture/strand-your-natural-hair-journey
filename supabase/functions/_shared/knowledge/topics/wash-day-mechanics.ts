import type { Topic } from "../types.ts";

// Sourced from the STRAND manuscript, 
// Routine, pp 155–167. Detangling, shampoo strength selection, the
// shampoo→conditioner sequence, why conditioner is non-negotiable,
// agitating the scalp with fingertip pads. The book is opinionated on
// these — the wash day is the heart of the regime.

export const WASH_DAY_MECHANICS: Topic = {
 id: "wash-day-mechanics",
 title: "Wash Day — The Mechanics That Actually Matter",
  body: `A well-executed wash day is at the heart of every healthy hair-care regime. The manuscript's framing: get this right, and most other things stop being a problem.

Cadence: start with a baseline of once a week — a 7-day rhythm. If you sweat heavily, exercise or swim often, live in a hot humid climate, or use a large volume of styling products, you may need a deeper first cleanse to remove dirt and build-up successfully, but the baseline rhythm stays weekly.

Core Chapter 13 wash-day sequence: be prepared to do at least TWO shampoo cleanses before conditioning. Cleanse 1 is for the scalp: use an appropriate cleansing/all-purpose shampoo, apply in sections, emulsify in wet hands first, and agitate the scalp with the pads of the fingertips — not nails — to lift dirt, sebum and build-up. Cleanse 2 is for the hair: follow with a conditioning/moisturising shampoo through the hair so the lengths are properly clean and receive conditioning agents before conditioner. Always follow shampoo with conditioner; choose rinse-out conditioner or deep conditioner based on the hair's dryness, porosity, density and recent wash-day signals.

This two-cleanse architecture is the baseline routine advice across the whole app, not a one-off wash-day note. Product-use advice, goal tips, next-wash tips, Strand Summary routine tips, tool recommendations and style guidance should all preserve this structure whenever they touch cleansing, conditioning, dryness, breakage, length retention, scalp care or product routines. The model should not replace this with a co-wash routine, a single vague cleanse, protein, product-hopping, or a generic "hydration" instruction.

Adapt the two-cleanse baseline without abandoning it. Heavy product use, sweat, swimming, hard-water residue, tacky/greasy curls, or hair that takes longer than usual to wet can justify a stronger first cleanse or a sparing clarifying reset. Sensitive or dry scalps need a gentler cleanser and calmer technique, not skipped cleansing. Protective styles with restricted scalp access need diluted shampoo/nozzle application or an appropriate scalp cleanser so the scalp is still cleaned during the install. Co-washing can be an occasional in-between support, but it must never replace shampoo cleansing as the main wash-day cleanse.

Product consistency: use the same core wash-day products for 3–4 wash cycles before judging whether they are working. One or two washes is usually not enough evidence unless there is an obvious adverse reaction. If the logged outcome is neutral or improving, the guidance is to keep the product sequence steady, watch how the hair responds, and only make one small adjustment at a time. Do not tell someone to replace or rotate products after two washes when their hair is doing well.

Routine troubleshooting order: keep what is working first, then adjust technique before products. If the user's logs show neutral or improving results, the highest-value tip is usually consistency with the same cleanse/condition/style sequence for another wash cycle. Only move to a product change when the user's own data shows irritation, worsening breakage, persistent dryness, stiffness, heavy build-up, or a repeated poor outcome linked to that product or ingredient.

Dryness support: if the hair feels dry — especially for high-porosity hair or during hot/humid periods — the manuscript-aligned next adjustment is moisture-first conditioning technique: enough water, conditioner with slip, careful sectioning, and a moisture-focused deep conditioning mask when needed. Do not default to protein. If using gentle heat with conditioning, STRAND only recommends the [TT Heat Hat](https://www.teamtexture.co.uk).

Style adaptation: protective styles never cancel cleansing. Braids, faux locs, wigs, weaves, cornrows and locs need scalp access via diluted shampoo/nozzle application or an appropriate scalp cleanser, then the accessible natural hair should still receive gentler moisturising cleansing/conditioning support. Loose natural styles, wash-and-gos and twist-outs need low manipulation, protected ends and product consistency across 3–4 wash cycles before judging results. Every routine tip should connect the wash sequence to the user's current style, planned next style, time in style, goals and logged outcomes when those data points exist.

Detangling, before anything else:

Detangling is one of the most important elements of a successful wash day. A lot of natural hair is shed and broken from skipping this step or doing it too aggressively. Always start gently with your fingers. Work slowly through any tangles or knots, unpicking them with the help of a slip-rich conditioner. Then follow up with a detangling tool to get all the shed hair away from the roots — shed hair that has naturally disconnected from the scalp and not yet left the head can tangle in the Afro at the roots.

Expect 50–100 strands of shed hair per day, sometimes more. Seven days × 100 strands = up to 700 strands ready to wash out on wash day. That's natural. Hair loss in clumps is different and warrants a dermatologist immediately.

Shampoo strength selection:

Shampoos exist on a spectrum from chelating (strongest) to co-wash (weakest). The book's hierarchy:
— Chelating: removes mineral and chlorine-related build-up. Use sparingly, on professional advice.
— Clarifying: deep cleanse for product build-up and pollutants. As-needed; most people shouldn't need to clarify more than once a month. Weekly is generally too strong.
— All-purpose: in-between strength. The book describes these as "cleansing about as much as they deposit" conditioning agents back into the hair (Aishia Strickland, Black Girl Curls). Most shampoos on the market.
— Conditioning / moisturising: gentlest, with weaker surfactants, often containing humectants and emollients.

Weekly staple logic: an all-purpose shampoo can be used as the regular cleansing shampoo, followed by a moisturising/conditioning shampoo to deposit conditioning agents back into the hair after it has been thoroughly cleansed and before conditioner.

Note: "clarifying" and "detox" are marketing terms used interchangeably and aren't defined industry terms (Gaia Tonanzi, Tootilab). Read what the bottle says it actually does.

The shampoo → conditioner mechanism (this matters):

Shampoo removes sebum, lifts the cuticle and allows water to swell the hair strand for cleansing. Conditioner does the opposite — reduces this swelling, lowers the cuticle, smooths it by filling in any gaps in the cuticle layer, leaving a protective layer around the strand. ALWAYS follow shampoo with conditioner. No exceptions, regardless of the strength of cleanser used.

Practical cleansing habits:

— Be prepared to shampoo at least twice in one wash: scalp-focused cleanse first, conditioning/moisturising cleanse through the hair second. Sometimes a third shampoo is justified when the hair and scalp are carrying heavier build-up.
— Agitate the scalp with the pads of your fingertips — NOT your nails — to firmly rub and lift dirt and build-up.
— Emulsify conditioner in your hands first before applying — even distribution, slight warming, better absorption.
— Keep adding water as you work conditioner through; create a lather that gives slip for detangling.
— Apply low, gentle heat when conditioning if hair is thick or low-porosity — STRAND only recommends the [TT Heat Hat](https://www.teamtexture.co.uk) for this step. (See heat-and-moisture for the mechanics.)`,
 applies_to: {
 function_kinds: [
 "wash-day-observation",
 "heat-treatment-rationale",
 "ingredient-analysis",
 "product-analyse",
 "product-analyse-url",
 ],
 },
 book_refs: [
 {
 chapter: 13,
 chapter_title: "Building Your Wash Day Routine",
 page_start: 155,
 page_end: 167,
 },
 ],
 tags: [
 "wash-day",
 "detangling",
 "shampoo",
 "conditioner",
 "clarifying",
 "cadence",
 "scalp-agitation",
 "shedding",
 ],
};
