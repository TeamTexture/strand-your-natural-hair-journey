alter table public.ad_events drop constraint ad_events_slot_check;
alter table public.ad_events add constraint ad_events_slot_check
  check (slot = any (array['home','products','wash_day','pro_welcome','brand_shelf','unknown']));