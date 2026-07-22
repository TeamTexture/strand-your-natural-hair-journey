
CREATE TABLE public.brand_offer_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.brand_offers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, user_id)
);

CREATE INDEX brand_offer_interest_offer_idx ON public.brand_offer_interest(offer_id);
CREATE INDEX brand_offer_interest_user_idx ON public.brand_offer_interest(user_id);

GRANT SELECT, INSERT, DELETE ON public.brand_offer_interest TO authenticated;
GRANT ALL ON public.brand_offer_interest TO service_role;

ALTER TABLE public.brand_offer_interest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can register their own interest"
  ON public.brand_offer_interest
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Members can remove their own interest"
  ON public.brand_offer_interest
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members read their own interest rows"
  ON public.brand_offer_interest
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Brand owner reads interest for own offers"
  ON public.brand_offer_interest
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.brand_offers o
      WHERE o.id = brand_offer_interest.offer_id
        AND o.brand_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins read all interest"
  ON public.brand_offer_interest
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.brand_offers
  ADD COLUMN IF NOT EXISTS brand_last_interest_seen_at timestamptz;
