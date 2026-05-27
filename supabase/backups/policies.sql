| policy_sql                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DROP POLICY IF EXISTS "Admins manage avatars" ON public.avatars;
CREATE POLICY "Admins manage avatars" ON public.avatars
AS PERMISSIVE
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                                             |
| DROP POLICY IF EXISTS "Anyone can view avatars" ON public.avatars;
CREATE POLICY "Anyone can view avatars" ON public.avatars
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                                                         |
| DROP POLICY IF EXISTS "bb_business_applications_delete" ON public.business_applications;
CREATE POLICY "bb_business_applications_delete" ON public.business_applications
AS PERMISSIVE
FOR DELETE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                          |
| DROP POLICY IF EXISTS "bb_business_applications_insert" ON public.business_applications;
CREATE POLICY "bb_business_applications_insert" ON public.business_applications
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (((submitted_by = auth.uid()) AND is_business_member(business_id, 'admin'::business_member_role)))
;                                                                            |
| DROP POLICY IF EXISTS "bb_business_applications_select" ON public.business_applications;
CREATE POLICY "bb_business_applications_select" ON public.business_applications
AS PERMISSIVE
FOR SELECT
TO public
USING (((submitted_by = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                                         |
| DROP POLICY IF EXISTS "bb_business_applications_update" ON public.business_applications;
CREATE POLICY "bb_business_applications_update" ON public.business_applications
AS PERMISSIVE
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                          |
| DROP POLICY IF EXISTS "bb_business_locations_delete" ON public.business_locations;
CREATE POLICY "bb_business_locations_delete" ON public.business_locations
AS PERMISSIVE
FOR DELETE
TO public
USING ((is_business_member(business_id, 'admin'::business_member_role) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                  |
| DROP POLICY IF EXISTS "bb_business_locations_insert" ON public.business_locations;
CREATE POLICY "bb_business_locations_insert" ON public.business_locations
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK ((is_business_member(business_id, 'admin'::business_member_role) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                             |
| DROP POLICY IF EXISTS "bb_business_locations_select" ON public.business_locations;
CREATE POLICY "bb_business_locations_select" ON public.business_locations
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                         |
| DROP POLICY IF EXISTS "bb_business_locations_update" ON public.business_locations;
CREATE POLICY "bb_business_locations_update" ON public.business_locations
AS PERMISSIVE
FOR UPDATE
TO public
USING ((is_business_member(business_id, 'admin'::business_member_role) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                  |
| DROP POLICY IF EXISTS "bb_business_members_delete" ON public.business_members;
CREATE POLICY "bb_business_members_delete" ON public.business_members
AS PERMISSIVE
FOR DELETE
TO public
USING ((is_business_member(business_id, 'admin'::business_member_role) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                          |
| DROP POLICY IF EXISTS "bb_business_members_insert" ON public.business_members;
CREATE POLICY "bb_business_members_insert" ON public.business_members
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK ((is_business_member(business_id, 'admin'::business_member_role) OR has_role(auth.uid(), 'admin'::app_role) OR ((user_id = auth.uid()) AND (role = 'owner'::business_member_role))))
;              |
| DROP POLICY IF EXISTS "bb_business_members_select" ON public.business_members;
CREATE POLICY "bb_business_members_select" ON public.business_members
AS PERMISSIVE
FOR SELECT
TO public
USING ((is_business_member(business_id, 'staff'::business_member_role) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                          |
| DROP POLICY IF EXISTS "bb_business_members_update" ON public.business_members;
CREATE POLICY "bb_business_members_update" ON public.business_members
AS PERMISSIVE
FOR UPDATE
TO public
USING ((is_business_member(business_id, 'admin'::business_member_role) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                          |
| DROP POLICY IF EXISTS "bb_businesses_delete" ON public.businesses;
CREATE POLICY "bb_businesses_delete" ON public.businesses
AS PERMISSIVE
FOR DELETE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                                      |
| DROP POLICY IF EXISTS "bb_businesses_insert" ON public.businesses;
CREATE POLICY "bb_businesses_insert" ON public.businesses
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK ((auth.uid() IS NOT NULL))
;                                                                                                                                                                                                |
| DROP POLICY IF EXISTS "bb_businesses_select" ON public.businesses;
CREATE POLICY "bb_businesses_select" ON public.businesses
AS PERMISSIVE
FOR SELECT
TO public
USING (((verification_status = 'approved'::partner_status) OR is_business_member(id, 'staff'::business_member_role) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                     |
| DROP POLICY IF EXISTS "bb_businesses_update" ON public.businesses;
CREATE POLICY "bb_businesses_update" ON public.businesses
AS PERMISSIVE
FOR UPDATE
TO public
USING ((is_business_member(id, 'admin'::business_member_role) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                                                           |
| DROP POLICY IF EXISTS "Anyone can view canonical events" ON public.canonical_events;
CREATE POLICY "Anyone can view canonical events" ON public.canonical_events
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                     |
| DROP POLICY IF EXISTS "Service role manages canonical events" ON public.canonical_events;
CREATE POLICY "Service role manages canonical events" ON public.canonical_events
AS PERMISSIVE
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                           |
| DROP POLICY IF EXISTS "Admins can delete categories" ON public.categories;
CREATE POLICY "Admins can delete categories" ON public.categories
AS PERMISSIVE
FOR DELETE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                      |
| DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;
CREATE POLICY "Admins can insert categories" ON public.categories
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                 |
| DROP POLICY IF EXISTS "Admins can update categories" ON public.categories;
CREATE POLICY "Admins can update categories" ON public.categories
AS PERMISSIVE
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                      |
| DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;
CREATE POLICY "Anyone can view categories" ON public.categories
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                                             |
| DROP POLICY IF EXISTS "Anyone can view city lookup" ON public.city_lookup;
CREATE POLICY "Anyone can view city lookup" ON public.city_lookup
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                                         |
| DROP POLICY IF EXISTS "Admins can view click logs" ON public.click_logs;
CREATE POLICY "Admins can view click logs" ON public.click_logs
AS PERMISSIVE
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                          |
| DROP POLICY IF EXISTS "Anyone can insert click logs" ON public.click_logs;
CREATE POLICY "Anyone can insert click logs" ON public.click_logs
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (true)
;                                                                                                                                                                                                    |
| DROP POLICY IF EXISTS "Admins manage event categories" ON public.event_categories;
CREATE POLICY "Admins manage event categories" ON public.event_categories
AS PERMISSIVE
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                         |
| DROP POLICY IF EXISTS "Anyone can view event categories" ON public.event_categories;
CREATE POLICY "Anyone can view event categories" ON public.event_categories
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                     |
| DROP POLICY IF EXISTS "Admins manage event series" ON public.event_series;
CREATE POLICY "Admins manage event series" ON public.event_series
AS PERMISSIVE
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                         |
| DROP POLICY IF EXISTS "Anyone can view event series" ON public.event_series;
CREATE POLICY "Anyone can view event series" ON public.event_series
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                                     |
| DROP POLICY IF EXISTS "Anyone can view events" ON public.events;
CREATE POLICY "Anyone can view events" ON public.events
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                                                             |
| DROP POLICY IF EXISTS "Business users can create events" ON public.events;
CREATE POLICY "Business users can create events" ON public.events
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK ((has_role(auth.uid(), 'business'::app_role) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                                                 |
| DROP POLICY IF EXISTS "Business users can delete own events" ON public.events;
CREATE POLICY "Business users can delete own events" ON public.events
AS PERMISSIVE
FOR DELETE
TO public
USING (((auth.uid() = business_user_id) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                                                         |
| DROP POLICY IF EXISTS "Business users can update own events" ON public.events;
CREATE POLICY "Business users can update own events" ON public.events
AS PERMISSIVE
FOR UPDATE
TO public
USING (((auth.uid() = business_user_id) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                                                         |
| DROP POLICY IF EXISTS "Admins manage feed registry" ON public.feed_registry;
CREATE POLICY "Admins manage feed registry" ON public.feed_registry
AS PERMISSIVE
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                     |
| DROP POLICY IF EXISTS "Anyone can view feed registry" ON public.feed_registry;
CREATE POLICY "Anyone can view feed registry" ON public.feed_registry
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                                 |
| DROP POLICY IF EXISTS "Admins can view ingestion errors" ON public.ingestion_errors;
CREATE POLICY "Admins can view ingestion errors" ON public.ingestion_errors
AS PERMISSIVE
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                  |
| DROP POLICY IF EXISTS "Admins manage ingestion errors" ON public.ingestion_errors;
CREATE POLICY "Admins manage ingestion errors" ON public.ingestion_errors
AS PERMISSIVE
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                         |
| DROP POLICY IF EXISTS "Admins can view ingestion runs" ON public.ingestion_runs;
CREATE POLICY "Admins can view ingestion runs" ON public.ingestion_runs
AS PERMISSIVE
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                          |
| DROP POLICY IF EXISTS "Admins manage ingestion runs" ON public.ingestion_runs;
CREATE POLICY "Admins manage ingestion runs" ON public.ingestion_runs
AS PERMISSIVE
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                 |
| DROP POLICY IF EXISTS "Anyone can view metro areas" ON public.metro_areas;
CREATE POLICY "Anyone can view metro areas" ON public.metro_areas
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                                         |
| DROP POLICY IF EXISTS "Only admins can manage metro areas" ON public.metro_areas;
CREATE POLICY "Only admins can manage metro areas" ON public.metro_areas
AS PERMISSIVE
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                           |
| DROP POLICY IF EXISTS "Partners can delete own employees" ON public.partner_employees;
CREATE POLICY "Partners can delete own employees" ON public.partner_employees
AS PERMISSIVE
FOR DELETE
TO public
USING (((EXISTS ( SELECT 1
   FROM partner_profiles pp
  WHERE ((pp.id = partner_employees.partner_profile_id) AND (pp.user_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role)))
; |
| DROP POLICY IF EXISTS "Partners can insert own employees" ON public.partner_employees;
CREATE POLICY "Partners can insert own employees" ON public.partner_employees
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK ((EXISTS ( SELECT 1
   FROM partner_profiles pp
  WHERE ((pp.id = partner_employees.partner_profile_id) AND (pp.user_id = auth.uid())))))
;                                         |
| DROP POLICY IF EXISTS "Partners can update own employees" ON public.partner_employees;
CREATE POLICY "Partners can update own employees" ON public.partner_employees
AS PERMISSIVE
FOR UPDATE
TO public
USING (((EXISTS ( SELECT 1
   FROM partner_profiles pp
  WHERE ((pp.id = partner_employees.partner_profile_id) AND (pp.user_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role)))
; |
| DROP POLICY IF EXISTS "Partners can view own employees" ON public.partner_employees;
CREATE POLICY "Partners can view own employees" ON public.partner_employees
AS PERMISSIVE
FOR SELECT
TO public
USING (((EXISTS ( SELECT 1
   FROM partner_profiles pp
  WHERE ((pp.id = partner_employees.partner_profile_id) AND (pp.user_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role)))
;     |
| DROP POLICY IF EXISTS "Anyone can view partner events" ON public.partner_events;
CREATE POLICY "Anyone can view partner events" ON public.partner_events
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                             |
| DROP POLICY IF EXISTS "Partners can delete own events" ON public.partner_events;
CREATE POLICY "Partners can delete own events" ON public.partner_events
AS PERMISSIVE
FOR DELETE
TO public
USING (((EXISTS ( SELECT 1
   FROM partner_profiles pp
  WHERE ((pp.id = partner_events.partner_profile_id) AND (pp.user_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role)))
;                |
| DROP POLICY IF EXISTS "Partners can insert own events" ON public.partner_events;
CREATE POLICY "Partners can insert own events" ON public.partner_events
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK ((EXISTS ( SELECT 1
   FROM partner_profiles pp
  WHERE ((pp.id = partner_events.partner_profile_id) AND (pp.user_id = auth.uid())))))
;                                                        |
| DROP POLICY IF EXISTS "Partners can update own events" ON public.partner_events;
CREATE POLICY "Partners can update own events" ON public.partner_events
AS PERMISSIVE
FOR UPDATE
TO public
USING (((EXISTS ( SELECT 1
   FROM partner_profiles pp
  WHERE ((pp.id = partner_events.partner_profile_id) AND (pp.user_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role)))
;                |
| DROP POLICY IF EXISTS "Admins can delete partner profiles" ON public.partner_profiles;
CREATE POLICY "Admins can delete partner profiles" ON public.partner_profiles
AS PERMISSIVE
FOR DELETE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                              |
| DROP POLICY IF EXISTS "Anyone can view partner profiles" ON public.partner_profiles;
CREATE POLICY "Anyone can view partner profiles" ON public.partner_profiles
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                     |
| DROP POLICY IF EXISTS "Partners can insert own profile" ON public.partner_profiles;
CREATE POLICY "Partners can insert own profile" ON public.partner_profiles
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (((auth.uid() = user_id) AND has_role(auth.uid(), 'partner'::app_role)))
;                                                                                                                |
| DROP POLICY IF EXISTS "Partners can update own profile" ON public.partner_profiles;
CREATE POLICY "Partners can update own profile" ON public.partner_profiles
AS PERMISSIVE
FOR UPDATE
TO public
USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                                                        |
| DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles" ON public.profiles
AS PERMISSIVE
FOR DELETE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                              |
| DROP POLICY IF EXISTS "System creates profiles" ON public.profiles;
CREATE POLICY "System creates profiles" ON public.profiles
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK ((auth.uid() = user_id))
;                                                                                                                                                                                                |
| DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
AS PERMISSIVE
FOR UPDATE
TO public
USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                                                                              |
| DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
AS PERMISSIVE
FOR SELECT
TO public
USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                                                                                  |
| DROP POLICY IF EXISTS "Users can save events" ON public.saved_events;
CREATE POLICY "Users can save events" ON public.saved_events
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK ((auth.uid() = user_id))
;                                                                                                                                                                                            |
| DROP POLICY IF EXISTS "Users can unsave events" ON public.saved_events;
CREATE POLICY "Users can unsave events" ON public.saved_events
AS PERMISSIVE
FOR DELETE
TO public
USING ((auth.uid() = user_id))
;                                                                                                                                                                                             |
| DROP POLICY IF EXISTS "Users can view own saved events" ON public.saved_events;
CREATE POLICY "Users can view own saved events" ON public.saved_events
AS PERMISSIVE
FOR SELECT
TO public
USING ((auth.uid() = user_id))
;                                                                                                                                                                             |
| DROP POLICY IF EXISTS "Admins can view search logs" ON public.search_logs;
CREATE POLICY "Admins can view search logs" ON public.search_logs
AS PERMISSIVE
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                      |
| DROP POLICY IF EXISTS "Anyone can insert search logs" ON public.search_logs;
CREATE POLICY "Anyone can insert search logs" ON public.search_logs
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (true)
;                                                                                                                                                                                                |
| DROP POLICY IF EXISTS "Users can create own preferences" ON public.search_preferences;
CREATE POLICY "Users can create own preferences" ON public.search_preferences
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK ((auth.uid() = user_id))
;                                                                                                                                                          |
| DROP POLICY IF EXISTS "Users can delete own preferences" ON public.search_preferences;
CREATE POLICY "Users can delete own preferences" ON public.search_preferences
AS PERMISSIVE
FOR DELETE
TO public
USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                                                  |
| DROP POLICY IF EXISTS "Users can update own preferences" ON public.search_preferences;
CREATE POLICY "Users can update own preferences" ON public.search_preferences
AS PERMISSIVE
FOR UPDATE
TO public
USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                                                  |
| DROP POLICY IF EXISTS "Users can view own preferences" ON public.search_preferences;
CREATE POLICY "Users can view own preferences" ON public.search_preferences
AS PERMISSIVE
FOR SELECT
TO public
USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                                                      |
| DROP POLICY IF EXISTS "Admins can view source events" ON public.source_events;
CREATE POLICY "Admins can view source events" ON public.source_events
AS PERMISSIVE
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                              |
| DROP POLICY IF EXISTS "Admins manage source events" ON public.source_events;
CREATE POLICY "Admins manage source events" ON public.source_events
AS PERMISSIVE
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                     |
| DROP POLICY IF EXISTS "Admins can view sources" ON public.sources;
CREATE POLICY "Admins can view sources" ON public.sources
AS PERMISSIVE
FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                                      |
| DROP POLICY IF EXISTS "Admins manage sources" ON public.sources;
CREATE POLICY "Admins manage sources" ON public.sources
AS PERMISSIVE
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                                             |
| DROP POLICY IF EXISTS "Admins can delete subcategories" ON public.subcategories;
CREATE POLICY "Admins can delete subcategories" ON public.subcategories
AS PERMISSIVE
FOR DELETE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                          |
| DROP POLICY IF EXISTS "Admins can insert subcategories" ON public.subcategories;
CREATE POLICY "Admins can insert subcategories" ON public.subcategories
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                     |
| DROP POLICY IF EXISTS "Admins can update subcategories" ON public.subcategories;
CREATE POLICY "Admins can update subcategories" ON public.subcategories
AS PERMISSIVE
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                          |
| DROP POLICY IF EXISTS "Anyone can view subcategories" ON public.subcategories;
CREATE POLICY "Anyone can view subcategories" ON public.subcategories
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                                 |
| DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles" ON public.user_roles
AS PERMISSIVE
FOR DELETE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                                |
| DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles" ON public.user_roles
AS PERMISSIVE
FOR UPDATE
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                                |
| DROP POLICY IF EXISTS "Only admins can insert roles" ON public.user_roles;
CREATE POLICY "Only admins can insert roles" ON public.user_roles
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                          |
| DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
AS PERMISSIVE
FOR SELECT
TO public
USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
;                                                                                                                                                  |
| DROP POLICY IF EXISTS "Admins can manage venues" ON public.venues;
CREATE POLICY "Admins can manage venues" ON public.venues
AS PERMISSIVE
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin'::app_role))
;                                                                                                                                                                                         |
| DROP POLICY IF EXISTS "Anyone can view venues" ON public.venues;
CREATE POLICY "Anyone can view venues" ON public.venues
AS PERMISSIVE
FOR SELECT
TO public
USING (true)
;                                                                                                                                                                                                                             |