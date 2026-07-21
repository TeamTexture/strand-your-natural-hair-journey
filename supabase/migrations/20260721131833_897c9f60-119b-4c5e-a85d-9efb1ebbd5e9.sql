CREATE TABLE public.platform_pricing_changes (
  id uuid primary key default gen_random_uuid(),
  changed_by uuid references auth.users(id) on delete set null,
  product_kind text not null check (product_kind in ('consumer', 'pro')),
  old_price_id text,
  new_price_id text not null,
  old_amount_gbp numeric(10, 2),
  new_amount_gbp numeric(10, 2) not null,
  currency text not null default 'gbp',
  interval text not null default 'month',
  notes text,
  created_at timestamptz not null default now()
);

GRANT SELECT ON public.platform_pricing_changes TO authenticated;
GRANT ALL ON public.platform_pricing_changes TO service_role;

ALTER TABLE public.platform_pricing_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view pricing changes"
  ON public.platform_pricing_changes
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX platform_pricing_changes_created_at_idx
  ON public.platform_pricing_changes (created_at DESC);