-- Admin read access for the three tables that admin screens query but could
-- never see. Same pattern as the existing "Admins can read passport" policies
-- (has_role security-definer function, read-only, authenticated role only).

CREATE POLICY "Admins read all pro subscriptions"
  ON public.pro_subscriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can read passport professional"
  ON public.user_professionals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can read passport challenges"
  ON public.user_challenges FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));