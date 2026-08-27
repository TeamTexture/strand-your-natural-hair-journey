ALTER TABLE public.brand_offers
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS brand_offers_hidden_at_idx ON public.brand_offers (hidden_at);

-- Member-facing read policies must never surface a hidden offer. The brand's
-- own "Brand owns offers" policy and the admin policy are unchanged, so both
-- sides keep full access (stats, revisions, discount code).
DROP POLICY IF EXISTS "Ended offers readable by authenticated" ON public.brand_offers;
CREATE POLICY "Ended offers readable by authenticated"
ON public.brand_offers
FOR SELECT
USING (status = 'ended'::brand_offer_status AND hidden_at IS NULL);

DROP POLICY IF EXISTS "Paid or live offers readable in window" ON public.brand_offers;
CREATE POLICY "Paid or live offers readable in window"
ON public.brand_offers
FOR SELECT
USING (
  status = ANY (ARRAY['paid_scheduled'::brand_offer_status, 'live'::brand_offer_status])
  AND starts_on IS NOT NULL
  AND ends_on IS NOT NULL
  AND starts_on <= strand_today_london()
  AND ends_on >= strand_today_london()
  AND hidden_at IS NULL
);