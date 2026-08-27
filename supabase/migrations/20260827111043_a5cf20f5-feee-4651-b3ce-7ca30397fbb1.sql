-- The pre-ad_events stats table has not been written to since 2026-07-31 and is
-- read by nothing (no views, no functions, no client code, and it never had
-- anon/authenticated grants). Freeze it under a name that cannot be mistaken
-- for live reporting so a future feature can't wire itself back to stale data.

DROP TRIGGER IF EXISTS trg_brand_offer_stats_updated ON public.brand_offer_stats_legacy;

ALTER TABLE public.brand_offer_stats_legacy
  RENAME TO brand_offer_stats_archive_2026_07;

REVOKE ALL ON public.brand_offer_stats_archive_2026_07 FROM anon, authenticated;
GRANT SELECT ON public.brand_offer_stats_archive_2026_07 TO service_role;

COMMENT ON TABLE public.brand_offer_stats_archive_2026_07 IS
  'FROZEN ARCHIVE — DO NOT READ FOR REPORTING. Counter-based campaign stats from before the ad_events log existed (rows span 2026-07-21..2026-07-31; ad_events begins 2026-08-06). Superseded by public.brand_offer_stats (live view over ad_events + ad_stats_daily) and public.brand_offer_metrics(). Its impressions/taps columns are RAW INCREMENT TALLIES, not distinct-member reach, so they cannot be mapped into public.ad_stats_daily without fabricating a reach figure — kept only as a historical record. Never grant to anon or authenticated; never join into a reporting view.';
