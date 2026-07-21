-- ─────────────── ROLES ───────────────
create type public.app_role as enum ('consumer', 'professional', 'admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "Users read own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

-- Security-definer helper — used by every downstream policy that checks role.
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

-- Admins can read all role rows (used by /admin panel).
create policy "Admins read all roles"
  on public.user_roles for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Auto-assign consumer on signup (does NOT touch existing users).
create or replace function public.assign_default_consumer_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'consumer')
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_assign_consumer
  after insert on auth.users
  for each row execute function public.assign_default_consumer_role();

-- Backfill consumer role for every existing user (so /pro/* and consumer app
-- both work immediately for legacy accounts). Idempotent.
insert into public.user_roles (user_id, role)
select id, 'consumer'::public.app_role from auth.users
on conflict (user_id, role) do nothing;

-- ─────────────── PRO APPLICATIONS ───────────────
create type public.pro_discipline as enum (
  'Trichologist',
  'Dermatologist',
  'Curl Specialist',
  'Colourist',
  'Stylist'
);

create type public.pro_application_status as enum (
  'pending',
  'approved',
  'rejected',
  'suspended'
);

create table public.pro_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text not null,
  business_name text,
  discipline public.pro_discipline not null,
  qualifications text,
  insurance_provider text,
  insurance_policy_no text,
  insurance_expiry date,
  location text,
  postcode text,
  website_url text,
  instagram_handle text,
  why_strand text,
  status public.pro_application_status not null default 'pending',
  admin_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.pro_applications to authenticated;
grant all on public.pro_applications to service_role;

alter table public.pro_applications enable row level security;

create policy "Applicants read own application"
  on public.pro_applications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Applicants create own application"
  on public.pro_applications for insert
  to authenticated
  with check (auth.uid() = user_id and status = 'pending');

create policy "Admins read all applications"
  on public.pro_applications for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins update applications"
  on public.pro_applications for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create trigger update_pro_applications_updated_at
  before update on public.pro_applications
  for each row execute function public.update_updated_at_column();

create index idx_pro_applications_status on public.pro_applications(status);
create index idx_pro_applications_user_id on public.pro_applications(user_id);
