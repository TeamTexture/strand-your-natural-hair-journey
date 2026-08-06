create table public.data_protection_complaints (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,
  contact_email      text not null,
  subject            text not null,
  details            text not null,
  status             text not null default 'received',
  submitted_at       timestamptz not null default now(),
  acknowledged_at    timestamptz,
  resolved_at        timestamptz,
  admin_notes        text,
  resolution_summary text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint data_protection_complaints_status_check
    check (status in ('received','acknowledged','resolved','rejected')),
  constraint data_protection_complaints_email_present
    check (length(trim(contact_email)) > 3)
);

comment on table public.data_protection_complaints is
  'DPA 2018 s.164A complaints. Must be acknowledged within 30 days of submitted_at. Never deleted - no delete policy exists by design.';

grant select, insert on public.data_protection_complaints to authenticated;
grant update on public.data_protection_complaints to authenticated;
grant all on public.data_protection_complaints to service_role;

alter table public.data_protection_complaints enable row level security;

create policy dpc_member_insert_own
  on public.data_protection_complaints for insert to authenticated
  with check (user_id = auth.uid());

create policy dpc_member_read_own
  on public.data_protection_complaints for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy dpc_admin_update
  on public.data_protection_complaints for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create index idx_dpc_status_submitted
  on public.data_protection_complaints (status, submitted_at);

create trigger trg_dpc_updated
  before update on public.data_protection_complaints
  for each row execute function public.set_updated_at();

-- Admin bell notification, matching the existing contact-message pattern.
create or replace function public.admin_notify_data_protection_complaint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_admins(
    'data_protection_complaint',
    'New data protection complaint',
    left(coalesce(new.subject, 'Complaint'), 120),
    'data_protection_complaint',
    new.id,
    '/admin/data-protection'
  );
  return new;
end;
$$;

revoke all on function public.admin_notify_data_protection_complaint() from public, anon, authenticated;

create trigger trg_admin_notify_dpc
  after insert on public.data_protection_complaints
  for each row execute function public.admin_notify_data_protection_complaint();