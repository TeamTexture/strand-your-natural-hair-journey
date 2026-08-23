create table if not exists public.onboarding_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_key text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, draft_key)
);

grant select, insert, update, delete on public.onboarding_drafts to authenticated;
grant all on public.onboarding_drafts to service_role;

alter table public.onboarding_drafts enable row level security;

create policy "Members read own onboarding drafts"
  on public.onboarding_drafts for select to authenticated
  using (auth.uid() = user_id);

create policy "Members write own onboarding drafts"
  on public.onboarding_drafts for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Members update own onboarding drafts"
  on public.onboarding_drafts for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Members delete own onboarding drafts"
  on public.onboarding_drafts for delete to authenticated
  using (auth.uid() = user_id);