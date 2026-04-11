
-- 1. Fix click_logs: replace permissive INSERT true with basic validation
DROP POLICY IF EXISTS "Anyone can insert click logs" ON public.click_logs;
CREATE POLICY "Anyone can insert click logs"
  ON public.click_logs
  FOR INSERT
  TO public
  WITH CHECK (canonical_event_id IS NOT NULL);

-- 2. Fix search_logs: replace permissive INSERT true with basic validation
DROP POLICY IF EXISTS "Anyone can insert search logs" ON public.search_logs;
CREATE POLICY "Anyone can insert search logs"
  ON public.search_logs
  FOR INSERT
  TO public
  WITH CHECK (searched_city_or_zip IS NOT NULL OR metro_area_id IS NOT NULL);

-- 3. Fix partner_employees: restrict SELECT to authenticated users only
DROP POLICY IF EXISTS "Partners can view own employees" ON public.partner_employees;
CREATE POLICY "Partners can view own employees"
  ON public.partner_employees
  FOR SELECT
  TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM partner_profiles pp
      WHERE pp.id = partner_employees.partner_profile_id
        AND pp.user_id = auth.uid()
    ))
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- 4. Fix user_roles: close INSERT gap for public/anon role
DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;
CREATE POLICY "Only admins can insert roles"
  ON public.user_roles
  FOR INSERT
  TO public
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
