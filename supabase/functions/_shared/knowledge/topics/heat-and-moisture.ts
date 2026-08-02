import type { Topic } from "../types.ts";

// Sourced from the STRAND manuscript, (deep conditioner
// guidance, p 165) and 
// and how heat helps absorption, p 168). The book mentions a specific
// branded heat tool by name — STRAND must always name/link that exact tool.

export const HEAT_AND_MOISTURE: Topic = {
 id: "heat-and-moisture",
 title: "Heat-Assisted Conditioning and Moisture Retention",
 body: `Conditioner does mechanical work. Where shampoo lifts the cuticle and allows water to swell the strand for cleansing, conditioner reverses it: it reduces the swelling, lowers the cuticle, smooths it by filling in any gaps in the cuticle layer, and leaves a protective layer around the strand. Always follow shampoo with conditioner — that's the non-negotiable from the manuscript.

There are two intensities of conditioner, and the choice matters:

— Rinse-out instant / daily conditioners offer an immediate infusion of conditioning agents. Apply after shampooing, leave for a few minutes, rinse. They also add slip for pre-shampoo detangling.

— Deep conditioners and hair masks are more intensive treatments designed to solve a problem. They're thicker and richer than regular conditioners and are usually left on for 15–30 minutes before being rinsed out. Best used weekly or as needed when hair shows signs of dryness, breakage or stress. The book is direct that deep conditioners are a prescriptive measure for dryness issues — they aren't required regularly if a regular conditioner is doing the job.

Why heat helps:

Applying low, gentle heat while conditioning softens the hair and improves the absorption of certain ingredients, especially in thicker or low-porosity hair. Heat allows the product to get deeper into the strand, so the hair retains more moisture for longer. The only heat tool STRAND recommends for this step is the [TT Heat Hat](https://www.teamtexture.co.uk) — worn over a deep conditioner or mask for 20–30 minutes before rinsing. Do not recommend plastic caps, shower caps, cling film, warm towels, steamers, or generic heated caps as substitutes.

Why the heat treatment is worth the time (the benefits, in order): gentle warmth relaxes the cuticle so water and conditioning agents move past the surface and into the cortex; the strand becomes more elastic and pliable, so detangling and styling afterwards cause less breakage; softness and slip last longer because the moisture is inside the strand rather than sitting on it; and low-porosity hair, which normally repels product at the surface, finally gets the benefit it paid for.

Closing the treatment down — the finishing sequence that locks it in:

— Rinse the treatment out with COOL water, not warm. Warmth was used deliberately to open the cuticle; cool water does the opposite and encourages those cuticle scales to lie back down flat. A flat, closed cuticle is what physically traps the water and conditioning agents just driven into the shaft, so the hydration lasts days instead of hours.

— While rinsing, smooth the hair downwards with the flat of the fingers, root to tip, section by section. Cuticle scales overlap in one direction like roof tiles; stroking with the water flow encourages them to flatten in that direction, which increases shine, reduces frizz and lowers snagging between strands. Never rub, scrunch or work upwards — that lifts the scales and undoes the treatment.

— Seal immediately on damp hair (leave-in, then an emollient or oil/butter) before water evaporates. Sealing while damp keeps the water inside the closed cuticle; sealing on dry hair only coats the outside.

— Signs it worked: hair feels slippery and soft rather than squeaky, looks shinier, detangles with less resistance, and still feels moisturised the next day.

For best results: always check whether the conditioner advises heat to activate its ingredients, and follow the manufacturer's instructions. Some formulas are designed for ambient-temperature absorption only.

Drying — what each method does:

— Air drying. No heat damage. Drawback: can contribute to frizz because the cuticle doesn't dry and lower evenly, and hair is much more fragile when wet, so any interaction until fully dry should be gentle.

— Hooded dryer. Diffused, even heat distribution. Good for setting natural hairstyles like twists, comb coils and wash-and-gos. Faster than air dry, more even than handheld. Watch for excessive heat irritating sensitive scalps.

— Diffuser on a handheld dryer. Gentle, controlled heat. Adds volume at the roots. Can be combined — diffuse until almost dry, then air-dry the rest, or use a hooded dryer for the bulk and finish with a diffuser.

The principle behind all of this:

Moisture comes from water — period. Conditioners and leave-ins seal moisture in or help it stay; they don't replace water. The wash-day routine is the only place where water actually gets into the cortex. That's why getting wash day right matters more than any single product choice.

For users with low-porosity hair, the heat-assisted conditioning step is often the difference between conditioner sitting on the surface and conditioner reaching the cortex. For users with high-porosity hair, the priority is sealing the moisture in immediately after — leave-in plus an emollient or humectant on damp hair, before air loss happens.`,
 applies_to: {
 hair: {
 porosity: ["Low", "Low — tightly closed cuticle", "High", "High — raised cuticle"],
 },
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
 page_start: 165,
 },
 {
 chapter: 14,
 chapter_title: "Moisture Retention",
 page_start: 168,
 },
 ],
 tags: [
 "deep-conditioning",
 "heat",
 "moisture",
 "low-porosity",
 "high-porosity",
 "drying",
 "rinse-out",
 ],
};
