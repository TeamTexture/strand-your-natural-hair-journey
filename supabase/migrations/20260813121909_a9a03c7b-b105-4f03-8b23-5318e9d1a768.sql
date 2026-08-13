alter table public.profiles add column if not exists payment_required_at timestamptz;

comment on column public.profiles.payment_required_at is 'When set, the member is forced to the subscribe screen and blocked from the app until they have an active membership.';

update public.profiles
set payment_required_at = now()
where user_id in (
  '1105db22-5ac7-4ae6-85a1-bea48a5d7d71',
  'd552aa5e-f1bb-4dbf-8f7f-d22ea7af1bb0',
  'e8463e81-bf98-4cf0-8f20-15144d73ec8e'
);