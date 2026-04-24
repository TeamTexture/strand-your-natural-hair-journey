create table public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null default 'length_retention',
  title text not null,
  unit text not null default 'inches',
  target_value numeric not null,
  current_value numeric not null default 0,
  start_value numeric not null default 0,
  target_date date,
  status text not null default 'in_progress',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_goals enable row level security;

create policy "Users view own goals" on public.user_goals
  for select using (auth.uid() = user_id);
create policy "Users insert own goals" on public.user_goals
  for insert with check (auth.uid() = user_id);
create policy "Users update own goals" on public.user_goals
  for update using (auth.uid() = user_id);
create policy "Users delete own goals" on public.user_goals
  for delete using (auth.uid() = user_id);

create trigger user_goals_set_updated_at
  before update on public.user_goals
  for each row execute function public.set_updated_at();

create index user_goals_user_id_idx on public.user_goals(user_id);