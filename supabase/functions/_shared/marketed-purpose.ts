// Marketed purpose + surfactant reasoning rules.
// Shared by product-analyse (photo flow) and product-analyse-url (URL flow)
// so both providers produce the same reasoning about how a product's stated
// purpose changes what the same INCI list actually does on the hair.

export const MARKETED_PURPOSE_RULES = `MARKETED PURPOSE + SURFACTANT STRENGTH — HARD RULE:

1. Always set marketed_purpose from the product's own positioning: the product name, front-of-pack claims, the range it sits in, and the brand's description. Choose exactly one of:
   dry_hair, damaged_hair, colour_treated, greasy_oily, general_all_hair_types, moisture, repair, clarifying.
   Use general_all_hair_types only when the product makes no specific claim.

2. Two products can share an identical INCI list and behave completely differently, because the CONCENTRATION of the primary surfactant is tuned to the hair need the product is sold for. Exact percentages are never published, so you must reason from the marketed purpose:
   - greasy_oily and clarifying → expect a HIGH primary-surfactant load. Strong cleansing, more likely to strip. Say so, and pair it with a proper conditioning step afterwards.
   - dry_hair, damaged_hair, moisture, repair, colour_treated → expect a LOWER primary-surfactant load, more secondary/amphoteric co-surfactants, gentler cleansing but more risk of build-up if used alone on an oily scalp.
   - general_all_hair_types → expect a middle-of-the-road load; say the cleansing strength is average and let the user's own scalp behaviour decide.

3. Factor this into match_score and ai_summary. Example of the reasoning you should apply: a clarifying or greasy-hair shampoo on a high-porosity user with a length-retention goal scores lower and MUST be paired with an intensive conditioning step in the same wash, because raised cuticles lose water fast and a heavy primary surfactant makes that worse.

4. For every cleansing agent in key_ingredients, set surfactant_role to "primary" or "secondary"; set "none" for everything else.
   - primary = the main detergent doing the bulk of the cleansing (sodium lauryl sulfate, sodium laureth sulfate, sodium coco-sulfate, ammonium laureth sulfate, sodium C14-16 olefin sulfonate, sodium methyl cocoyl taurate used as the lead cleanser).
   - secondary = co-surfactants and amphoterics that boost lather, thicken, and soften the primary (cocamidopropyl betaine, coco-glucoside, decyl glucoside, lauryl glucoside, sodium cocoamphoacetate, disodium cocoamphodiacetate).

5. Never state or imply a numeric percentage for any surfactant. Percentages are not published — say the guidance is based on what the product is sold to do.`;
