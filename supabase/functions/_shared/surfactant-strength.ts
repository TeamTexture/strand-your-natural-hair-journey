// Surfactant strength reasoning rules.
// Shared by product-analyse (photo flow) and product-analyse-url (URL flow)
// so both providers reason the same way about how a product's positioning
// changes what the same INCI list actually does on the hair.
//
// NOTE (2026-08): the model no longer EMITS a marketed purpose field — nothing
// in the app reads it. It still has to work the positioning out internally,
// because surfactant strength cannot be judged from the INCI list alone.

export const SURFACTANT_STRENGTH_RULES = `SURFACTANT STRENGTH — HARD RULE:

1. WORK OUT WHAT THE PRODUCT IS SOLD FOR, INTERNALLY. The user is never asked. Read the product title word by word first, then the brand and range, any front-of-pack claims or descriptors ("moisture repair shampoo", "for dry & damaged hair", "clarifying", "colour protect"), and the full ingredient list. The title outranks any guess from the ingredients. Do NOT output this classification as a field — use it only to reason with.

2. SANITY-CHECK THE CLAIM AGAINST THE FORMULA. If the title promises one thing but the INCI says another — e.g. sold on "moisture" but leading with a strong primary surfactant and barely any conditioning agents — call that mismatch out in ai_summary, and let the formula (not the marketing) drive match_score.

3. Two products can share an identical INCI list and behave completely differently, because the CONCENTRATION of the primary surfactant is tuned to the hair need the product is sold for. Exact percentages are never published, so reason from the positioning:
   - oily/greasy or clarifying positioning → expect a HIGH primary-surfactant load. Strong cleansing, more likely to strip. Say so, and pair it with a proper conditioning step afterwards.
   - dry, damaged, moisture, repair, colour-protect positioning → expect a LOWER primary-surfactant load, more secondary/amphoteric co-surfactants, gentler cleansing but more risk of build-up if used alone on an oily scalp.
   - density, growth or scalp-health positioning → the work is aimed at the scalp, so expect a moderate cleansing base designed to clear the scalp without stripping; say plainly that the lengths still need their own conditioning step.
   - no specific claim → expect a middle-of-the-road load; say the cleansing strength is average and let the user's own scalp behaviour decide.

4. Factor this into match_score and ai_summary. Example of the reasoning you should apply: a clarifying or greasy-hair shampoo on a high-porosity user with a length-retention goal scores lower and MUST be paired with an intensive conditioning step in the same wash, because raised cuticles lose water fast and a heavy primary surfactant makes that worse.

5. For every cleansing agent in key_ingredients, set surfactant_role to "primary" or "secondary"; set "none" for everything else.
   - primary = the main detergent doing the bulk of the cleansing (sodium lauryl sulfate, sodium laureth sulfate, sodium coco-sulfate, ammonium laureth sulfate, sodium C14-16 olefin sulfonate, sodium methyl cocoyl taurate used as the lead cleanser).
   - secondary = co-surfactants and amphoterics that boost lather, thicken, and soften the primary (cocamidopropyl betaine, coco-glucoside, decyl glucoside, lauryl glucoside, sodium cocoamphoacetate, disodium cocoamphodiacetate).

6. Never state or imply a numeric percentage for any surfactant. Percentages are not published — say the guidance is based on what the product is sold to do.`;
