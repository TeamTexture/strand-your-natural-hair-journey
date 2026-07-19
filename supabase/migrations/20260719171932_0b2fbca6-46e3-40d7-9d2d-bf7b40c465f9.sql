create table if not exists public.ai_citation_violations (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  stripped_text text not null,
  original_length integer,
  cleaned_length integer,
  created_at timestamptz not null default now()
);

grant select, insert on public.ai_citation_violations to service_role;

create index if not exists ai_citation_violations_function_idx
  on public.ai_citation_violations (function_name, created_at desc);

alter table public.ai_citation_violations enable row level security;
