-- Phase 2 Step 1 — manuscript chunks table + private storage bucket.
-- See docs/PHASE_2_AUDIT.md §3 for the full design.
--
-- LICENSING NOTE: the manuscript content is *How To Love Your Afro* by
-- Paige Lewin (Bloomsbury Tonic, 2025). It is licensed by Bloomsbury for
-- STRAND with explicit publisher permission. Service-role-only access by
-- design — clients (anon, authenticated) MUST NOT be able to read the
-- raw chunks. The opt-out clause in Bloomsbury's standard licensing
-- prohibits use of the text for AI training in general; STRAND's
-- permission is operational (RAG over a single licensed deployment) and
-- does not extend to training, sharing, or exposing the source text.

-- ─────────────────────── pgvector ───────────────────────
create extension if not exists vector;

-- ─────────────────────── manuscript_chunks ───────────────────────
-- Each row: one chunked passage from the manuscript with its embedding.
-- Schema is verbatim from PHASE_2_AUDIT.md §3.3.
create table public.manuscript_chunks (
  id              uuid primary key default gen_random_uuid(),
  chapter         int not null,
  chapter_title   text not null,
  section_heading text,
  page_start      int,
  page_end        int,
  body            text not null,
  embedding       vector(1536) not null,
  token_count     int,
  created_at      timestamptz not null default now()
);

-- Cosine similarity index. lists=50 is a reasonable default for a
-- corpus of this size; can be tuned later via REINDEX after ANALYZE.
create index manuscript_chunks_embedding_idx
  on public.manuscript_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

-- Enable RLS but grant NO select/insert/update/delete policies to
-- authenticated or anon. Service role bypasses RLS, so edge functions
-- with the service-role key can read; nothing else can. This is the
-- intentional access model for licensed manuscript content.
alter table public.manuscript_chunks enable row level security;

-- ─────────────────────── manuscript storage bucket ───────────────────────
-- Private bucket for the source manuscript markdown. Same lockdown as
-- the post-patch voicenotes bucket: not public, no client-facing
-- policies. The embed-and-index-manuscript edge function reads from
-- here using the service-role key.
insert into storage.buckets (id, name, public)
values ('manuscript', 'manuscript', false)
on conflict (id) do update set public = false;

-- No SELECT/INSERT/UPDATE/DELETE policies are created on storage.objects
-- for bucket_id = 'manuscript'. Service role bypasses; nothing else has
-- access by default. Do not add policies for authenticated or anon
-- without an explicit licensing review.
