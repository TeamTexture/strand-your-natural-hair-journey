
## Phase 1 known issues — to address in 1.5 or separate session:
- [ ] Length goal not populating on home page when added in hair goals journal
- [ ] **NEW FEATURE BACKLOG**: When AI suggests heat treatment / steam, prompt user about Heat Hat. Never suggest hooded dryer or non-TT alternatives. Phase 2+.
- [ ] paige@paige.com has typo'd email (info@teamtexure.co.uk - missing 't'). Cosmetic, account works fine.
- [x] ~~heat-treatment-rationale edge function broken (corsHeaders import). Separate session.~~ **Fixed 2026-04-26 in commit `6e50ccd` (out-of-order from Phase 2 Step 5b) to unblock the deploy pipeline — bare specifier `@supabase/supabase-js/cors` swapped for `../_shared/cors.ts`. The hardcoded fake fallback (index.ts L116–125) and Gemini call are untouched; killing the fallback + migrating to Claude remains Step 5b scope per PHASE_2_AUDIT.md.**


- [ ] **CACHE INVALIDATION POLICY**: Remove 're-analyse' button entirely from product profile UI. Analyses auto-regenerate behind the scenes when relevant user data changes — and ONLY when relevant data changes. Triggers: hair profile update (porosity/density/diameter/scalp/diagnosed conditions), blood results update or new test, health profile change (life stage, medications, conditions), style change (current hairstyle), heritage change, location change (hard water area). Implement as a Postgres trigger or edge function that nukes ai_summaries rows for that user when any trigger column updates. Phase 2.5 scope after all 8 AI functions are migrated. User never sees 'analysing' twice for the same product unless their data changed.
