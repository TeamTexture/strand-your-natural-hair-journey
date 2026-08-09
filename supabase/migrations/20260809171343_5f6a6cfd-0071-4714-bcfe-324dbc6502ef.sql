create or replace function public.invalidate_sponsored_wash_tips()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
begin
  if v_user is not null then
    delete from public.ai_summaries
    where user_id = v_user
      and kind like 'brand\_wash\_tip\_v%';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_invalidate_sponsored_tips_hair on public.user_hair_profile;
create trigger trg_invalidate_sponsored_tips_hair
after insert or update or delete on public.user_hair_profile
for each row execute function public.invalidate_sponsored_wash_tips();

drop trigger if exists trg_invalidate_sponsored_tips_style on public.user_style_profile;
create trigger trg_invalidate_sponsored_tips_style
after insert or update or delete on public.user_style_profile
for each row execute function public.invalidate_sponsored_wash_tips();

drop trigger if exists trg_invalidate_sponsored_tips_goals on public.user_goals;
create trigger trg_invalidate_sponsored_tips_goals
after insert or update or delete on public.user_goals
for each row execute function public.invalidate_sponsored_wash_tips();