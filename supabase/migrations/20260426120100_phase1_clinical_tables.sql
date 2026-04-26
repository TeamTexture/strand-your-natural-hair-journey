-- Phase 1 — clinical tables
-- Four new 1:1-per-user tables for hair / health / style / chosen professional.
-- Encrypted columns are bytea storing nonce(24) || crypto_secretbox_easy ciphertext.
-- See docs/PHASE_1_PLAN.md §1 / §2 / §3.
-- The update_updated_at_column() trigger function was created in migration
-- 20260424141005; we reuse it here.

-- ─────────────────────── USER_HAIR_PROFILE ───────────────────────
create table public.user_hair_profile (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null unique references auth.users(id) on delete cascade,
  diameter                   text,
  surface_texture            text,
  density                    text,
  porosity                   text,
  elasticity                 text,
  scalp_condition_enc        bytea,
  diagnosed_conditions_enc   bytea,
  areas_of_concern           text[] not null default '{}',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
alter table public.user_hair_profile enable row level security;
create index idx_user_hair_profile_user on public.user_hair_profile(user_id);

create policy "Users view own hair profile" on public.user_hair_profile
  for select using (auth.uid() = user_id);
create policy "Users insert own hair profile" on public.user_hair_profile
  for insert with check (auth.uid() = user_id);
create policy "Users update own hair profile" on public.user_hair_profile
  for update using (auth.uid() = user_id);
create policy "Users delete own hair profile" on public.user_hair_profile
  for delete using (auth.uid() = user_id);

create trigger update_user_hair_profile_updated_at
  before update on public.user_hair_profile
  for each row execute function public.update_updated_at_column();

-- ─────────────────────── USER_HEALTH_PROFILE ───────────────────────
create table public.user_health_profile (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null unique references auth.users(id) on delete cascade,
  life_stage_enc             bytea,
  contraception_enc          bytea,
  medical_conditions_enc     bytea,
  diet                       text,
  diet_balance               text,
  smoke                      text,
  alcohol                    text,
  daily_water                text,
  exercise                   text,
  sleep_quality              text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
alter table public.user_health_profile enable row level security;
create index idx_user_health_profile_user on public.user_health_profile(user_id);

create policy "Users view own health profile" on public.user_health_profile
  for select using (auth.uid() = user_id);
create policy "Users insert own health profile" on public.user_health_profile
  for insert with check (auth.uid() = user_id);
create policy "Users update own health profile" on public.user_health_profile
  for update using (auth.uid() = user_id);
create policy "Users delete own health profile" on public.user_health_profile
  for delete using (auth.uid() = user_id);

create trigger update_user_health_profile_updated_at
  before update on public.user_health_profile
  for each row execute function public.update_updated_at_column();

-- ─────────────────────── USER_STYLE_PROFILE ───────────────────────
create table public.user_style_profile (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null unique references auth.users(id) on delete cascade,
  current_colour_status      text,
  chemical_history           text[] not null default '{}',
  current_hairstyle          text,
  style_set_at               timestamptz,
  planned_next_style         text,
  planned_change_date        date,
  default_styles             text[] not null default '{}',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
alter table public.user_style_profile enable row level security;
create index idx_user_style_profile_user on public.user_style_profile(user_id);

create policy "Users view own style profile" on public.user_style_profile
  for select using (auth.uid() = user_id);
create policy "Users insert own style profile" on public.user_style_profile
  for insert with check (auth.uid() = user_id);
create policy "Users update own style profile" on public.user_style_profile
  for update using (auth.uid() = user_id);
create policy "Users delete own style profile" on public.user_style_profile
  for delete using (auth.uid() = user_id);

create trigger update_user_style_profile_updated_at
  before update on public.user_style_profile
  for each row execute function public.update_updated_at_column();

-- ─────────────────────── USER_PROFESSIONALS ───────────────────────
-- Distinct from public.professionals_directory (the public directory of vetted
-- pros). This is the user's CHOSEN professional with consultation details.
create table public.user_professionals (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null unique references auth.users(id) on delete cascade,
  directory_id               uuid references public.professionals_directory(id) on delete set null,
  name                       text,
  professional_type          text,
  clinic                     text,
  consultation_date          date,
  gmc_number_enc             bytea,
  iot_number_enc             bytea,
  notes_enc                  bytea,
  notes_audio_path           text,
  instagram_handle           text,
  website_url                text,
  booking_url                text,
  picked_from_directory      boolean not null default false,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
alter table public.user_professionals enable row level security;
create index idx_user_professionals_user on public.user_professionals(user_id);

create policy "Users view own professional" on public.user_professionals
  for select using (auth.uid() = user_id);
create policy "Users insert own professional" on public.user_professionals
  for insert with check (auth.uid() = user_id);
create policy "Users update own professional" on public.user_professionals
  for update using (auth.uid() = user_id);
create policy "Users delete own professional" on public.user_professionals
  for delete using (auth.uid() = user_id);

create trigger update_user_professionals_updated_at
  before update on public.user_professionals
  for each row execute function public.update_updated_at_column();
