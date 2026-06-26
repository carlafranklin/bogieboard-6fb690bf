
-- Phase 1B: Metro Areas Management
-- Dev backend only. No changes to legacy migrations, scrape, ingestion, or consumer behavior.

-- 1) Columns
ALTER TABLE public.metro_areas
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.metro_areas
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2) updated_at trigger reusing existing helper public.update_updated_at_column()
DROP TRIGGER IF EXISTS metro_areas_set_updated_at ON public.metro_areas;
CREATE TRIGGER metro_areas_set_updated_at
BEFORE UPDATE ON public.metro_areas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Index supporting Admin list filter on is_active
CREATE INDEX IF NOT EXISTS metro_areas_is_active_idx
  ON public.metro_areas (is_active);

-- 4) admin_upsert_metro_area: create or edit, with audit
CREATE OR REPLACE FUNCTION public.admin_upsert_metro_area(
  p_id uuid,
  p_name text,
  p_slug text,
  p_core_cities jsonb,
  p_included_counties jsonb,
  p_included_zip_prefixes jsonb,
  p_latitude double precision,
  p_longitude double precision
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
  v_slug text;
  v_core jsonb;
  v_counties jsonb;
  v_zips jsonb;
  v_old jsonb;
  v_new jsonb;
  v_action text;
BEGIN
  -- Authorize
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Normalize + validate
  v_name := NULLIF(TRIM(p_name), '');
  v_slug := lower(NULLIF(TRIM(p_slug), ''));
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'name is required' USING ERRCODE = '22023';
  END IF;
  IF v_slug IS NULL OR v_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'slug must match ^[a-z0-9-]+$' USING ERRCODE = '22023';
  END IF;

  v_core     := COALESCE(p_core_cities, '[]'::jsonb);
  v_counties := COALESCE(p_included_counties, '[]'::jsonb);
  v_zips     := COALESCE(p_included_zip_prefixes, '[]'::jsonb);

  IF p_id IS NULL THEN
    -- Create
    INSERT INTO public.metro_areas (
      name, slug, core_cities, included_counties, included_zip_prefixes, latitude, longitude
    ) VALUES (
      v_name, v_slug, v_core, v_counties, v_zips, p_latitude, p_longitude
    )
    RETURNING id INTO v_id;

    v_old := NULL;
    v_action := 'created';
  ELSE
    -- Edit (lock the row, capture old snapshot)
    SELECT to_jsonb(m.*) INTO v_old
    FROM public.metro_areas m
    WHERE m.id = p_id
    FOR UPDATE;

    IF v_old IS NULL THEN
      RAISE EXCEPTION 'metro area not found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.metro_areas
       SET name = v_name,
           slug = v_slug,
           core_cities = v_core,
           included_counties = v_counties,
           included_zip_prefixes = v_zips,
           latitude = p_latitude,
           longitude = p_longitude
     WHERE id = p_id;

    v_id := p_id;
    v_action := 'updated';
  END IF;

  -- Capture new snapshot
  SELECT to_jsonb(m.*) INTO v_new
  FROM public.metro_areas m
  WHERE m.id = v_id;

  -- Atomic audit; raises if it fails, rolling back the upsert
  PERFORM public.admin_log_action(
    v_action, 'metro_area', v_id, v_old, v_new, NULL
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_metro_area(uuid, text, text, jsonb, jsonb, jsonb, double precision, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_metro_area(uuid, text, text, jsonb, jsonb, jsonb, double precision, double precision) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_metro_area(uuid, text, text, jsonb, jsonb, jsonb, double precision, double precision) TO authenticated;

COMMENT ON FUNCTION public.admin_upsert_metro_area(uuid, text, text, jsonb, jsonb, jsonb, double precision, double precision) IS
  'Admin-only create/edit for metro_areas. Captures authoritative before/after snapshots and writes admin_log_action in the same transaction.';

-- 5) admin_set_metro_area_status: activate/deactivate, with audit + reason
CREATE OR REPLACE FUNCTION public.admin_set_metro_area_status(
  p_id uuid,
  p_is_active boolean,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_current_active boolean;
  v_reason text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'id is required' USING ERRCODE = '22023';
  END IF;

  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  IF p_is_active = false THEN
    IF v_reason IS NULL OR length(v_reason) < 3 THEN
      RAISE EXCEPTION 'reason is required (min 3 characters) for deactivation' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT to_jsonb(m.*), m.is_active
    INTO v_old, v_current_active
  FROM public.metro_areas m
  WHERE m.id = p_id
  FOR UPDATE;

  IF v_old IS NULL THEN
    RAISE EXCEPTION 'metro area not found' USING ERRCODE = 'P0002';
  END IF;

  -- No-op guard: do not write duplicate audit records
  IF v_current_active = p_is_active THEN
    RETURN;
  END IF;

  UPDATE public.metro_areas
     SET is_active = p_is_active
   WHERE id = p_id;

  SELECT to_jsonb(m.*) INTO v_new
  FROM public.metro_areas m
  WHERE m.id = p_id;

  PERFORM public.admin_log_action(
    CASE WHEN p_is_active THEN 'activated' ELSE 'deactivated' END,
    'metro_area',
    p_id,
    v_old,
    v_new,
    v_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_metro_area_status(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_metro_area_status(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_metro_area_status(uuid, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.admin_set_metro_area_status(uuid, boolean, text) IS
  'Admin-only activate/deactivate for metro_areas. Requires reason (>=3 chars) on deactivation. No-op when current status matches target. Writes admin_log_action in the same transaction.';
