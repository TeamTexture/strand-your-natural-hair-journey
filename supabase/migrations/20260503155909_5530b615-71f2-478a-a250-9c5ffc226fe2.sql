-- Trigger function: bump use_count / last_used_at on user_products for each
-- product attached to a wash_day. Idempotent on update by computing the diff
-- between OLD.product_ids and NEW.product_ids.
CREATE OR REPLACE FUNCTION public.bump_user_products_on_wash_day()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  added uuid[];
  removed uuid[];
  pid uuid;
  wash_ts timestamptz;
BEGIN
  wash_ts := (COALESCE(NEW.wash_date, CURRENT_DATE))::timestamptz;

  IF TG_OP = 'INSERT' THEN
    added := COALESCE(NEW.product_ids, '{}'::uuid[]);
    removed := '{}'::uuid[];
  ELSIF TG_OP = 'UPDATE' THEN
    added := ARRAY(
      SELECT unnest(COALESCE(NEW.product_ids, '{}'::uuid[]))
      EXCEPT
      SELECT unnest(COALESCE(OLD.product_ids, '{}'::uuid[]))
    );
    removed := ARRAY(
      SELECT unnest(COALESCE(OLD.product_ids, '{}'::uuid[]))
      EXCEPT
      SELECT unnest(COALESCE(NEW.product_ids, '{}'::uuid[]))
    );
  ELSIF TG_OP = 'DELETE' THEN
    added := '{}'::uuid[];
    removed := COALESCE(OLD.product_ids, '{}'::uuid[]);
  END IF;

  -- Increment newly-added products
  IF added IS NOT NULL THEN
    FOREACH pid IN ARRAY added LOOP
      UPDATE public.user_products
        SET use_count = use_count + 1,
            last_used_at = GREATEST(COALESCE(last_used_at, '-infinity'::timestamptz), wash_ts)
      WHERE id = pid AND user_id = COALESCE(NEW.user_id, OLD.user_id);
    END LOOP;
  END IF;

  -- Decrement removed products (clamp at 0). Recompute last_used_at from
  -- remaining wash days for that product so the timestamp stays accurate.
  IF removed IS NOT NULL THEN
    FOREACH pid IN ARRAY removed LOOP
      UPDATE public.user_products up
        SET use_count = GREATEST(use_count - 1, 0),
            last_used_at = (
              SELECT MAX(wash_date)::timestamptz FROM public.wash_days wd
              WHERE wd.user_id = up.user_id
                AND pid = ANY(wd.product_ids)
                AND (TG_OP <> 'UPDATE' OR wd.id <> NEW.id)
                AND (TG_OP <> 'DELETE' OR wd.id <> OLD.id)
            )
      WHERE up.id = pid AND up.user_id = COALESCE(NEW.user_id, OLD.user_id);
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_user_products_on_wash_day_ins ON public.wash_days;
CREATE TRIGGER trg_bump_user_products_on_wash_day_ins
AFTER INSERT ON public.wash_days
FOR EACH ROW EXECUTE FUNCTION public.bump_user_products_on_wash_day();

DROP TRIGGER IF EXISTS trg_bump_user_products_on_wash_day_upd ON public.wash_days;
CREATE TRIGGER trg_bump_user_products_on_wash_day_upd
AFTER UPDATE OF product_ids ON public.wash_days
FOR EACH ROW EXECUTE FUNCTION public.bump_user_products_on_wash_day();

DROP TRIGGER IF EXISTS trg_bump_user_products_on_wash_day_del ON public.wash_days;
CREATE TRIGGER trg_bump_user_products_on_wash_day_del
AFTER DELETE ON public.wash_days
FOR EACH ROW EXECUTE FUNCTION public.bump_user_products_on_wash_day();

-- One-time backfill: recompute use_count and last_used_at from existing
-- wash_days.product_ids history. Safe to re-run.
WITH usage AS (
  SELECT
    wd.user_id,
    pid AS product_id,
    COUNT(*) AS uses,
    MAX(wd.wash_date)::timestamptz AS last_used
  FROM public.wash_days wd
  CROSS JOIN LATERAL unnest(COALESCE(wd.product_ids, '{}'::uuid[])) AS pid
  GROUP BY wd.user_id, pid
)
UPDATE public.user_products up
SET use_count = u.uses,
    last_used_at = GREATEST(COALESCE(up.last_used_at, '-infinity'::timestamptz), u.last_used)
FROM usage u
WHERE up.id = u.product_id AND up.user_id = u.user_id;
