-- =============================================================================
-- Migration: 20260628000001_fix_metro_status_audit_enum_cast.sql
-- Applies to: Dev Supabase (abkijvqhrvduqqzglfkj)
-- Purpose: Fix type-cast error in admin_set_metro_active().
--          PostgreSQL resolves an uncast CASE expression as text; the
--          admin_audit_log.action column is public.admin_action and
--          admin_audit_log.entity_type is public.admin_entity_type.
--          Adding explicit casts resolves:
--            "column action is of type admin_action but expression is of type text"
-- Scope: admin_set_metro_active() only.
--        No other function, table, policy, enum value, or migration is changed.
--        No Production changes. No Lovable Cloud changes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_metro_active(
  p_metro_id UUID,
  p_active   BOOLEAN,
  p_reason   TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  _caller_id  UUID;
  _old_active BOOLEAN;
  _slug       TEXT;
BEGIN
  -- Auth check
  _caller_id := auth.uid();
  IF _caller_id IS NULL OR NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'admin_set_metro_active: caller does not have the admin role'
      USING ERRCODE = 'P0401';
  END IF;

  -- p_active must not be NULL
  IF p_active IS NULL THEN
    RAISE EXCEPTION
      'admin_set_metro_active: p_active must be TRUE or FALSE, not NULL'
      USING ERRCODE = 'P0001';
  END IF;

  -- Reason is required when disabling
  IF p_active = false AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RAISE EXCEPTION
      'admin_set_metro_active: a reason is required when disabling a metro area'
      USING ERRCODE = 'P0001';
  END IF;

  -- Metro must exist
  SELECT is_active, slug INTO _old_active, _slug
  FROM   public.metro_areas WHERE id = p_metro_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_set_metro_active: metro_area with id % not found', p_metro_id
      USING ERRCODE = 'P0002';
  END IF;

  -- No-op guard
  IF _old_active = p_active THEN
    RAISE NOTICE 'admin_set_metro_active: metro % is already %.',
      _slug, CASE WHEN p_active THEN 'active' ELSE 'inactive' END;
    RETURN;
  END IF;

  -- Update
  UPDATE public.metro_areas SET is_active = p_active WHERE id = p_metro_id;

  -- Audit log
  -- FIXED: explicit casts to public.admin_action and public.admin_entity_type
  -- prevent "expression is of type text" errors when PostgreSQL resolves the
  -- CASE expression and the string literal as untyped text.
  INSERT INTO public.admin_audit_log
    (actor_id, action, entity_type, entity_id, old_value, new_value, reason)
  VALUES (
    _caller_id,
    (CASE WHEN p_active THEN 'metro_area_enabled'
          ELSE 'metro_area_disabled'
     END)::public.admin_action,
    'metro_area'::public.admin_entity_type,
    p_metro_id,
    jsonb_build_object('is_active', _old_active, 'slug', _slug),
    jsonb_build_object('is_active', p_active, 'slug', _slug),
    NULLIF(trim(COALESCE(p_reason, '')), '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_metro_active(UUID, BOOLEAN, TEXT)
  TO authenticated;

COMMENT ON FUNCTION public.admin_set_metro_active IS
  'Enables or disables a metro area. Does not delete dependent records. '
  'p_active must be TRUE or FALSE (NULL is rejected). '
  'p_reason is required and must be non-blank when disabling; optional when enabling. '
  'trim(p_reason) is stored in admin_audit_log.reason. Admin only. Writes audit log.';
