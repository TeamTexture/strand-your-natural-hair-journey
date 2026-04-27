import type { Topic } from "../types.ts";

// Sourced from the STRAND manuscript, (deep conditioner
// guidance, p 165) and 
// and how heat helps absorption, p 168). The book mentions a specific
// branded heat tool by name — STRAND deliberately keeps THIS topic
// generic per audit §7 (Heat Hat carve-out). No product names, no
// brand placeholders, no commented references.

export const HEAT_AND_MOISTURE: Topic = {
 id: "heat-and-moisture",
 title: "Heat-Assisted Conditioning and Moisture Retention",
 body: `Conditioner does mechanical work. Where shampoo lifts the cuticle and allows water to swell the strand for cleansing, conditioner reverses it: it reduces the swelling, lowers the cuticle, smooths it by filling in any gaps in the cuticle layer, and leaves a protective layer around the strand. Always follow shampoo with conditioner — that's the non-negotiable from the manuscript.

There are two intensities of conditioner, and the choice matters:

— Rinse-out instant / daily conditioners offer an immediate infusion of conditioning agents. Apply after shampooing, leave for a few minutes, rinse. They also add slip for pre-shampoo detangling.

— Deep conditioners and hair masks are more intensive treatments designed to solve a problem. They're thicker and richer than regular conditioners and are usually left on for 15–30 minutes before being rinsed out. Best used weekly or as needed when hair shows signs of dryness, breakage or stress. The book is direct that deep conditioners are a prescriptive measure for dryness issues — they aren't required regularly if a regular conditioner is doing the job.

Why heat helps:

Applying low, gentle heat while conditioning softens the hair and improves the absorption of certain ingredients, especially in thicker or low-porosity hair. Heat allows the product to get deeper into the strand, so the hair retains more moisture for longer. Common methods named in the manuscript are an electric heated cap or a warm towel for 20–30 minutes after applying conditioner or hair mask, then rinsing.

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
