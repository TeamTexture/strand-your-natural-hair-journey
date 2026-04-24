-- ============= Product voicenotes =============
create table public.product_voicenotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_key text not null,
  product_name text,
  product_brand text,
  audio_url text not null,
  duration_sec numeric,
  transcript text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_product_voicenotes_user on public.product_voicenotes(user_id);
create index idx_product_voicenotes_product on public.product_voicenotes(user_id, product_key);

alter table public.product_voicenotes enable row level security;

create policy "Users view own voicenotes"
  on public.product_voicenotes for select
  using (auth.uid() = user_id);

create policy "Users insert own voicenotes"
  on public.product_voicenotes for insert
  with check (auth.uid() = user_id);

create policy "Users update own voicenotes"
  on public.product_voicenotes for update
  using (auth.uid() = user_id);

create policy "Users delete own voicenotes"
  on public.product_voicenotes for delete
  using (auth.uid() = user_id);

create trigger trg_product_voicenotes_updated_at
  before update on public.product_voicenotes
  for each row execute function public.update_updated_at_column();

-- ============= Appointments =============
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  professional_name text not null,
  professional_type text,
  clinic_name text,
  appointment_date date not null,
  appointment_time text,
  reason text,
  notes text,
  status text not null default 'upcoming',
  follow_up_needed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_appointments_user on public.appointments(user_id);
create index idx_appointments_date on public.appointments(user_id, appointment_date);

alter table public.appointments enable row level security;

create policy "Users view own appointments"
  on public.appointments for select
  using (auth.uid() = user_id);

create policy "Users insert own appointments"
  on public.appointments for insert
  with check (auth.uid() = user_id);

create policy "Users update own appointments"
  on public.appointments for update
  using (auth.uid() = user_id);

create policy "Users delete own appointments"
  on public.appointments for delete
  using (auth.uid() = user_id);

create trigger trg_appointments_updated_at
  before update on public.appointments
  for each row execute function public.update_updated_at_column();

-- ============= Voicenotes storage bucket =============
insert into storage.buckets (id, name, public)
values ('voicenotes', 'voicenotes', true)
on conflict (id) do nothing;

create policy "Voicenotes are publicly readable"
  on storage.objects for select
  using (bucket_id = 'voicenotes');

create policy "Users upload own voicenotes"
  on storage.objects for insert
  with check (
    bucket_id = 'voicenotes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users update own voicenotes"
  on storage.objects for update
  using (
    bucket_id = 'voicenotes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own voicenotes"
  on storage.objects for delete
  using (
    bucket_id = 'voicenotes'
    and auth.uid()::text = (storage.foldername(name))[1]
  );