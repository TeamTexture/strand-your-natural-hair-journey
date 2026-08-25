alter table public.consumer_subscriptions add column if not exists trial_end timestamptz;

alter table public.profiles add column if not exists trial_offer_at timestamptz;

insert into public.platform_settings (key, value)
values ('consumer_plus_monthly_price_gbp', to_jsonb(14.99))
on conflict (key) do nothing;

-- A trialing STRAND+ member must not be treated as unpaid by the chat gate.
create or replace function public.can_send_chat_message(_thread_id uuid, _user_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select
    is_chat_participant(_thread_id, _user_id)
    and (
      exists (
        select 1 from consumer_subscriptions cs
        where cs.user_id = _user_id and cs.tier = 'plus'
          and cs.status in ('active', 'trialing')
      )
      or not exists (
        select 1
        from chat_threads t
        where t.id = _thread_id
          and t.pro_user_id is not null
          and (
            select min(a.appointment_date)
            from appointments a
            where a.user_id = _user_id
              and a.linked_pro_user_id = t.pro_user_id
              and a.cancelled_at is null
          ) < current_date
      )
    )
$function$;