
-- ─────────────────────────── PROFILES ───────────────────────────
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Users view own profile" on public.profiles
  for select using (auth.uid() = user_id);
create policy "Users insert own profile" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = user_id);
create policy "Users delete own profile" on public.profiles
  for delete using (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────── MEDICATIONS ───────────────────────────
create table public.user_medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  created_at timestamptz not null default now()
);
alter table public.user_medications enable row level security;
create index idx_user_medications_user on public.user_medications(user_id);

create policy "Users view own meds" on public.user_medications
  for select using (auth.uid() = user_id);
create policy "Users insert own meds" on public.user_medications
  for insert with check (auth.uid() = user_id);
create policy "Users update own meds" on public.user_medications
  for update using (auth.uid() = user_id);
create policy "Users delete own meds" on public.user_medications
  for delete using (auth.uid() = user_id);

-- Cap at 20 per user
create or replace function public.enforce_med_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.user_medications where user_id = new.user_id) >= 20 then
    raise exception 'Maximum of 20 medications per user';
  end if;
  return new;
end; $$;

create trigger enforce_med_limit_trg
  before insert on public.user_medications
  for each row execute function public.enforce_med_limit();

-- ─────────────────────── PROFESSIONALS DIRECTORY ───────────────────────
create type public.pro_type as enum ('Trichologist', 'Dermatologist', 'Curl Specialist');

create table public.professionals_directory (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null,
  type public.pro_type not null,
  clinic_name text,
  address text,
  postcode text,
  instagram_handle text,
  website_url text,
  booking_url text,
  bio text,
  specialisms text[] not null default '{}',
  verification_number text,
  verification_type text,
  discount_code text,
  discount_description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.professionals_directory enable row level security;
create index idx_pro_dir_postcode on public.professionals_directory(postcode);
create index idx_pro_dir_specialisms on public.professionals_directory using gin(specialisms);

create policy "Anyone can view active professionals" on public.professionals_directory
  for select using (is_active = true);

-- Seed entries
insert into public.professionals_directory
  (name, title, type, clinic_name, postcode, instagram_handle, website_url, booking_url, bio, specialisms, verification_number, verification_type, discount_code, discount_description, is_active)
values
  ('Teresa Richardson','Trichologist','Trichologist','Fulham Scalp & Hair Clinic','SW6','teresarichardsontrichology','https://fulhamscalpandhairclinic.com','https://fulhamscalpandhairclinic.com/book','Over 20 years specialising in Afro and textured hair trichology. Co-founder of Fulham Scalp & Hair Clinic. Featured in Texture Talks podcast Season 2.',array['Afro Hair','Hair Loss','Scalp Health','Traction Alopecia','CCCA'],'IOT-VERIFIED','IOT','STRAND15','15% off first consultation',true),
  ('Dr. Yvonne Abimbola','Dermatologist','Dermatologist','Dr Eve Skin','SW3','dreveskin','https://dreveskin.co.uk','https://dreveskin.co.uk/book','GP specialist and certified dermatologist. Founder of Dr Eve Skin, CQC-registered. Expert in deficiency-driven hair loss and conditions affecting skin of colour.',array['Scalp Dermatology','Hair Loss','Blood Analysis','Skin of Colour','Alopecia'],'GMC-VERIFIED','GMC','STRAND20','£20 off first assessment',true),
  ('Erica Liburd','Curl Specialist','Curl Specialist','The Muse Salon',null,'ericaliburdofficial','https://themusesalon.com','https://themusesalon.com/book','27+ years in hairdressing with a deep specialism in curly and coily textures. Professional educator. Known for her prescriptive approach — the hair tells the story.',array['Curl and Coil Styling','Afro Hair','Curl Assessment','Hair Health','Education'],null,null,'STRAND10','10% off',true);

-- ─────────────────────────── BLOOD RESULTS ───────────────────────────
create table public.blood_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  marker text not null,
  value numeric,
  unit text,
  status text,
  category text,
  updated_at timestamptz not null default now(),
  unique(user_id, marker)
);
alter table public.blood_results enable row level security;
create index idx_blood_user on public.blood_results(user_id);

create policy "Users view own blood" on public.blood_results
  for select using (auth.uid() = user_id);
create policy "Users insert own blood" on public.blood_results
  for insert with check (auth.uid() = user_id);
create policy "Users update own blood" on public.blood_results
  for update using (auth.uid() = user_id);
create policy "Users delete own blood" on public.blood_results
  for delete using (auth.uid() = user_id);

create trigger update_blood_updated_at
  before update on public.blood_results
  for each row execute function public.update_updated_at_column();

-- ─────────────────────────── AI SUMMARIES ───────────────────────────
create table public.ai_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'blood_summary',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, kind)
);
alter table public.ai_summaries enable row level security;

create policy "Users view own summary" on public.ai_summaries
  for select using (auth.uid() = user_id);
create policy "Users insert own summary" on public.ai_summaries
  for insert with check (auth.uid() = user_id);
create policy "Users update own summary" on public.ai_summaries
  for update using (auth.uid() = user_id);
create policy "Users delete own summary" on public.ai_summaries
  for delete using (auth.uid() = user_id);

create trigger update_ai_summaries_updated_at
  before update on public.ai_summaries
  for each row execute function public.update_updated_at_column();
