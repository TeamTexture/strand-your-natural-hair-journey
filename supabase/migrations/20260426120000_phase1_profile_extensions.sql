-- Voicenotes window check (audit §4 follow-up):
--   storage.objects within 2026-04-24T14:30:18Z..14:33:19Z, bucket=voicenotes
--   = 0 rows. No exposure during the 3-minute public-bucket window.
--   Verified by Paige on 2026-04-26 via Lovable Cloud SQL editor:
--   "Query succeeded. No rows returned."
--
-- Phase 1 — profiles extensions
-- Adds the identity columns that today live only in localStorage.
-- See docs/PHASE_1_PLAN.md §1 for column-level rationale.

alter table public.profiles
  add column heritage    text[]   not null default '{}',
  add column birth_year  smallint,
  add column postcode    text,
  add column country     text;

-- Backfill the 6 existing rows so the not-null constraint can be applied.
update public.profiles
   set country = 'United Kingdom'
 where country is null;

alter table public.profiles
  alter column country set default 'United Kingdom',
  alter column country set not null;
