-- Campaign products: pros need the same ownership rights as brands. Brand
-- accounts keep the strict brand paywall; pros are gated on their pro plan.
DROP POLICY IF EXISTS "Brand manages own products" ON public.brand_products;
CREATE POLICY "Brand manages own products" ON public.brand_products
FOR ALL TO authenticated
USING (
  ((brand_user_id = auth.uid()) AND (
     public.brand_paid_access(auth.uid())
     OR (public.has_active_pro_subscription(auth.uid()) AND NOT public.is_access_restricted(auth.uid()))
  ))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  ((brand_user_id = auth.uid()) AND (
     public.brand_paid_access(auth.uid())
     OR (public.has_active_pro_subscription(auth.uid()) AND NOT public.is_access_restricted(auth.uid()))
  ))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);