create extension if not exists vector;

create table if not exists public.manuscript_chunks (
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

create index if not exists manuscript_chunks_embedding_idx
  on public.manuscript_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 50);

alter table public.manuscript_chunks enable row level security;

insert into storage.buckets (id, name, public)
values ('manuscript', 'manuscript', false)
on conflict (id) do update set public = false;