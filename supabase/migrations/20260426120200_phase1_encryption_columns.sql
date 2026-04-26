-- Phase 1 — encryption columns on existing tables
-- Adds bytea columns for the AEAD-sealed equivalents of clinical fields that
-- already have plaintext rows. Plaintext columns stay in place; Phase 1.5
-- drops them after the soak window. Existing rows get encrypted in-place via
-- the phase1-backfill-existing-rows edge function (see docs/PHASE_1_PLAN.md
-- §4 / §6 / §7).

alter table public.user_medications
  add column name_enc       bytea,
  add column category_enc   bytea;

alter table public.blood_results
  add column value_enc      bytea,
  add column unit_enc       bytea;
