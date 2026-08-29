# Fix analysis wrapping and glossary reliability

## Scope
Comprehensively fix the repeated mid-word wrapping pattern and the ingredient-explainer failure, then verify at least five real ingredient popups across different products.

## Implementation
1. **Correct the shared analysis-row layout**
   - Remove the fragmented glossary text from the flex row that is squeezing each linked/plain segment into its own narrow column.
   - Keep only the rank/status icon as a fixed item; render the full factor phrase inside one `min-w-0` text container with normal word-boundary wrapping.
   - Audit every product/tool analysis, ingredient flag, glossary badge, and duplicated score-reason renderer for the same `flex + segmented glossary text` and `overflow-wrap:anywhere` pattern, and move them to the same whole-word-safe layout.
   - Harden the shared glossary token/button styling so linked terms inherit normal word wrapping and cannot split letters even when nested in a narrow card.

2. **Fix the actual Acetyl Tetrapeptide-3 failure path**
   - The term exists in the glossary; the failure is in the personalised-fit guardrail path. Its cached definition and fit make unsupported follicle/root and growth claims, so relationship validation strips the only personalised sentence and repeated regeneration can produce the same invalid relationship.
   - Make the explainer validate cached fit content before reuse, discard invalid cached fit, and retry with the exact rejection reason rather than repeating the same unconstrained generation.
   - Ensure the final retry cannot return a hollow fit: use a deterministic, member-profile-grounded explanation built only from verified ingredient category/role plus real stored traits, or return an honest unresolved state only when no safe relationship can be established.
   - Keep glossary definition, product role, and personalised fit independently available so one failed layer never collapses the whole popup.
   - Correct the invalid Acetyl Tetrapeptide-3 cached glossary/fit content so it no longer claims a cosmetic peptide reaches or strengthens the follicle/root.

3. **Regression coverage and live verification**
   - Add tests for segmented glossary phrases inside score cards, including “Water-based caffeine and peptide formula,” asserting whole words remain intact and no fragment becomes a separate flex column.
   - Add explainer/guardrail tests covering stale invalid cached fits, regeneration rejection, and a non-empty safe result.
   - Deploy the modified `ingredient-explainer` function and verify it boots.
   - In the live member view, open at least five ingredients from different products (including Acetyl Tetrapeptide-3 and a mix of molecule/class/concept terms), confirm every popup loads a real explanation, and capture/check each relevant card for whole-word wrapping.

## Safety
- Preserve the existing closed-vocabulary, ingredient-source, nullable-field, relationship-integrity, and no-reanalysis guarantees.
- No product analysis will be regenerated merely by viewing a page; this work is limited to glossary explanation layers and presentation.
