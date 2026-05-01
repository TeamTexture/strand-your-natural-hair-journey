import type { Topic } from "../types.ts";

// Sourced from the STRAND manuscript, 
// Routine, pp 158–159 (chelating shampoos, hard-water mineral build-up).
// The book is direct on hard water as a physical barrier on the hair
// shaft and gives the postcode-look-up tip Paige uses in practice.

export const HARD_WATER: Topic = {
 id: "hard-water",
 title: "Hard Water — Mineral Build-up Mitigation",
 body: `Hard water deposits minerals (calcium, magnesium, sometimes copper, iron and chlorine residue) onto the hair shaft. The book is direct: hard-water minerals build up on hair, making it feel stiff, dull, and difficult to manage, while also acting as a barrier preventing products from working or moisture from penetrating effectively. The user can be doing everything right — good shampoo, good conditioner, good leave-in — and the curls still feel heavy, dry, or weirdly product-resistant. That barrier is the cause.

How to know:

— Postcode lookup. The book's practical tip: type your postcode into Google followed by "water hardness" and the name of your area. STRAND already does this server-side via the hardWaterPostcodes data file when the user has set their postcode.
— Behaviour pattern. If hair takes longer than usual to wet down, stops reacting to styling products in the way it normally does, or curls feel heavy, tacky or even greasy to the touch, that's the same kind of build-up signal the manuscript describes.

IMPORTANT GUIDANCE RULE — chelating shampoos:

DO NOT recommend a chelating shampoo to the user. Even when the user is in a hard-water area, chelating shampoos are too harsh for routine recommendation in this product, particularly for curly, coily, colour-treated, fine, or already-dry hair. Treat them as a professional-only intervention.

Recommend instead, in this order of preference:

1. A shower-head filter for the hair-rinse water — addresses the cause rather than treating the symptom and is safe for daily use.
2. A gentle clarifying shampoo used sparingly (e.g. every 4–5 washes, or when hair feels heavy, greasy, or product-resistant) — softer than a chelating shampoo, still lifts mineral and product build-up reasonably well.
3. A deep conditioner / mask immediately after any clarifying step to restore moisture.
4. Talking to a trichologist or specialist stylist before considering anything stronger — only a professional should suggest a true chelating treatment, and only when warranted.

Reasoning to share with the user when relevant: chelating shampoos use strong chelating agents (e.g. EDTA, disodium EDTA) that strip minerals AND lipids and disrupt the cuticle. The book is explicit that using a cleanser this strong too often can cause serious damage to curls. So we don't push it — we route around it.

Daily-life pointers from the manuscript:

— A home water filter purifies drinking water; a shower-head filter is the equivalent for hair-rinse water and is the preferred mitigation here.
— Hard water also affects what conditioner can do — moisture can't penetrate through a mineral film. So a gentle clarifying step before deep conditioning is what unlocks the conditioner.

If a user's postcode is in a hard-water area AND they have not used any gentle clarifying step in their last few wash logs, that's a real, well-founded thing to flag — but flag it with a gentle clarifier or shower filter, never a chelating shampoo.`,
 applies_to: {
 location: { hard_water: true },
 function_kinds: [
 "wash-day-observation",
 "ingredient-analysis",
 "product-analyse",
 "product-analyse-url",
 "heat-treatment-rationale",
 ],
 },
 book_refs: [
 {
 chapter: 13,
 chapter_title: "Building Your Wash Day Routine",
 page_start: 158,
 page_end: 159,
 },
 ],
 tags: [
 "hard-water",
 "chelation",
 "EDTA",
 "build-up",
 "clarifying",
 "minerals",
 "UK-specific",
 ],
};
