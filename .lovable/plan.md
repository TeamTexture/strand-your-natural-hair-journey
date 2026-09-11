# Personalised ingredient benefit cards

## Assumptions
- Keep the approved emoji markers exactly as specified.
- “Lazy-loaded ingredient science” means the existing verified ingredient explainer data, not a new score or a second product analysis.
- If the formula does not contain a verified ingredient for one benefit, show that the benefit is not established rather than inventing an ingredient or claim.
- The requested generator remains deterministic local TypeScript. This avoids token spend, random output, retry loops, and any chance of changing the product score.

## Build
1. Add a focused ingredient-benefit module that:
   - defines the three fixed roles and titles;
   - selects real ingredients from the stored analysis/INCI data using verified categories and mechanisms;
   - simplifies display names without changing the captured ingredient identity;
   - builds a one- or two-sentence profile-specific paragraph from recorded porosity, goals, and challenges;
   - rejects forbidden jargon, unsupported moisture claims, and references to other products;
   - produces the same result for identical inputs.

2. Add a dedicated benefit-card section to the product detail page:
   - replace only the positive rows currently headed “What’s inside this formulation”;
   - keep “Things to watch for”, the sensitivity strip, score, stars, verdict, full ingredient list, and existing ingredient sheet unchanged;
   - render the three card shells immediately with 💧, 🛡️, and 🔒;
   - show real simplified ingredient names and the short personalised paragraph;
   - keep technical terms tappable through the shared glossary renderer.

3. Implement smart prefetch for ingredient science:
   - wait one second after the product and current profile are available;
   - prefetch each card independently through the existing ingredient-explainer function/cache;
   - cache by `product_id:user_id:profile_hash` with a per-card ingredient suffix, using the existing stable profile fingerprint rather than introducing score invalidation;
   - never block the first paint and never call a bulk “load all” endpoint;
   - reveal cached science immediately on tap, otherwise show “Analysing for you…” while that one card loads;
   - suppress timeout/failure cards and prevent repeat/cascading requests.

4. Add regression coverage:
   - the four requested generator tests: porosity/profile mention, sentence/length limit, goal or challenge mention, deterministic output;
   - a card interaction test proving the section renders, tapping reveals science, and failed prefetch shows only the quiet loading fallback;
   - a fragrance-sensitive detail fixture proving the red alert, score 18, one-star rating, “Best avoided”, “Always check the pack”, red caution section, and all three cards coexist;
   - strengthen score stability coverage so a stored 62 remains 62 on shelf and detail and no benefit/explainer payload can overwrite `user_products.match_score`.

## Verification
- Run the focused personalisation, sensitivity, score-consistency, and no-reanalysis tests.
- Run the broader relevant test suite and check the preview build diagnostics.
- Verify the product detail at the 375px app width.
- Capture the requested poor-match screenshot from a test fixture/account without changing a real member’s data.
- No database migration is planned. No existing edge function is modified unless inspection proves the explainer cannot support per-card reads; if that becomes necessary, deploy and boot-test it in the same task.
