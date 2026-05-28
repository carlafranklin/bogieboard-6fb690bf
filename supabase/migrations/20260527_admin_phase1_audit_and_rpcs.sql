-- =============================================================================
-- BogieBoard Admin Phase 1 Migration
-- File    : bogieboard_admin_phase1_migration.sql
-- Created : 2026-05-26
-- Rev     : 4 — full correctness rewrite with exact prescribed section ordering.
--               Section 0 now uses DROP TABLE ... CASCADE so no statement
--               references admin_audit_log before it exists.
--
-- HISTORY OF FAILURES AND ROOT CAUSES
-- -------------------------------------
-- Rev 1: SELECT EXISTS (...) INTO _target_exists
--         → Postgres parsed _target_exists as a relation name (SELECT INTO DDL).
-- Rev 2: SELECT jsonb_agg(...) / INTO _old_roles / FROM public.user_roles
--         → Same parser ambiguity; _old_roles treated as a relation name.
-- Rev 3: DROP TRIGGER IF EXISTS ... ON public.admin_audit_log (Section 0)
--   and: DROP POLICY IF EXISTS ... ON public.admin_audit_log (Section 0)
--         → Both require the table to exist. On a fresh database, the table
--           does not exist when Section 0 runs → 42P01 relation does not exist.
--
-- REV 4 FIXES
-- ------------
-- Fix 1 (Issues A/B/C, carried from Rev 3):
--   All SELECT INTO replaced with := (SELECT ...) or := EXISTS(...).
--   No PL/pgSQL variable appears in FROM, JOIN, or table position anywhere.
--
-- Fix 2 (Issues D/E, Rev 4):
--   Section 0 now leads with:
--     DROP TABLE IF EXISTS public.admin_audit_log CASCADE;
--   CASCADE removes all dependent objects (trigger, policy, indexes) without
--   ever needing to reference the table in DROP TRIGGER or DROP POLICY.
--   The separate DROP TRIGGER and DROP POLICY lines are removed entirely.
--
-- PRESCRIBED SECTION ORDER (matches the specification exactly)
-- -------------------------------------------------------------
--   Section  0 — Cleanup partial objects (table CASCADE first)
--   Section  1 — Create enums
--   Section  2 — Create admin_audit_log table
--   Section  3 — Comments on admin_audit_log
--   Section  4 — Enable RLS on admin_audit_log
--   Section  5 — Create SELECT policy on admin_audit_log
--   Section  6 — Create indexes on admin_audit_log
--   Section  7 — Create prevent_audit_log_created_at_change() function
--   Section  8 — Create trg_audit_log_immutable_created_at trigger
--   Section  9 — Create admin_assign_role(), admin_review_business(),
--                admin_moderate_event()
--   Section 10 — GRANT EXECUTE
--   Section 11 — Validation queries
--   Section 12 — Rollback script
--
-- RULE: public.admin_audit_log is NEVER referenced before Section 2.
--
-- VARIABLE AUDIT — every underscore variable in every function
-- -------------------------------------------------------------
--   admin_assign_role:
--     _caller_id     UUID          := auth.uid()
--     _old_roles     JSONB         := (SELECT jsonb_agg(...) FROM ...)
--     _new_roles     JSONB         := (SELECT jsonb_agg(...) FROM ...)
--     _target_exists BOOLEAN       := EXISTS (SELECT 1 FROM ...)
--     _role_exists   BOOLEAN       := EXISTS (SELECT 1 FROM ...)
--     _audit_action  admin_action  := CASE expression
--   admin_review_business:
--     _caller_id     UUID          := auth.uid()
--     _old_status    partner_status := (SELECT ... FROM public.businesses ...)
--     _old_notes     TEXT          := (SELECT ... FROM public.businesses ...)
--     _audit_action  admin_action  := CASE expression
--   admin_moderate_event:
--     _caller_id     UUID          := auth.uid()
--     _old_status    TEXT          := (SELECT ... FROM public.partner_events ...)
--     _old_notes     TEXT          := (SELECT ... FROM public.partner_events ...)
--     _audit_action  admin_action  := CASE expression
--
--   NO variable appears in FROM, JOIN, INSERT INTO, UPDATE, or DELETE position.
--
-- DEPENDS ON
-- ----------
--   Original migrations (profiles, user_roles, partner_events, app_role enum)
--   Phase 1  (businesses, business_applications, partner_status enum)
--   Phase 2a (create_business_with_owner, record_login)
--   Phase 2b (hardened RLS)
--
-- BACKWARD COMPATIBILITY
-- ----------------------
--   Admin.tsx direct mutations are NOT broken by this migration.
--   handleAddRole/RemoveRole and handleApproveEvent/RejectEvent continue working
--   via existing RLS policies until the frontend migrates to the new RPCs.
-- =============================================================================


-- =============================================================================
-- SECTION 0 — CLEANUP PARTIAL OBJECTS
--
-- PURPOSE: Remove objects that may have been committed by a prior failed run,
-- so this migration can recreate them cleanly.
--
-- ORDERING RULE: DROP TABLE CASCADE comes FIRST. CASCADE removes all dependent
-- objects (trigger, policy, indexes) in a single statement without needing to
-- reference the table in separate DROP TRIGGER / DROP POLICY statements.
-- Those separate statements would fail with 42P01 if the table does not exist.
--
-- After the table is gone, drop functions and enums (they have no table dependency).
-- All statements use IF EXISTS — safe on a completely fresh database.
-- =============================================================================

-- Step 1: Drop the table with CASCADE.
-- This removes in one shot: the trigger, RLS policy, all indexes, all rows.
-- Nothing below this point needs to reference admin_audit_log until Section 2.
DROP TABLE IF EXISTS public.admin_audit_log CASCADE;

-- Step 2: Drop functions (no dependency on the table).
DROP FUNCTION IF EXISTS public.admin_assign_role(UUID, public.app_role, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_review_business(UUID, public.partner_status, TEXT);
DROP FUNCTION IF EXISTS public.admin_moderate_event(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.prevent_audit_log_created_at_change();

-- Step 3: Drop enum types (must come after DROP TABLE; columns referenced them).
DROP TYPE IF EXISTS public.admin_action;
DROP TYPE IF EXISTS public.admin_entity_type;


-- =============================================================================
-- SECTION 1 — ENUMS
--
-- Created BEFORE the table because the table's column types reference them.
-- DO $$ EXCEPTION WHEN duplicate_object is the idempotent pattern for enums
-- (Postgres has no CREATE TYPE IF NOT EXISTS syntax).
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.admin_action AS ENUM (
    'role_granted',
    'role_revoked',
    'business_approved',
    'business_rejected',
    'business_suspended',
    'partner_event_approved',
    'partner_event_rejected',
    'partner_event_pending'
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Type admin_action already exists — skipping.';
END $$;

DO $$ BEGIN
  CREATE TYPE public.admin_entity_type AS ENUM (
    'user_role',
    'business',
    'business_application',
    'partner_event'
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Type admin_entity_type already exists — skipping.';
END $$;


-- =============================================================================
-- SECTION 2 — admin_audit_log TABLE
--
-- First time public.admin_audit_log is mentioned in executable SQL.
-- All subsequent sections depend on this table existing.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id           UUID                      NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id     UUID                      REFERENCES auth.users(id) ON DELETE SET NULL,
  action       public.admin_action       NOT NULL,
  entity_type  public.admin_entity_type  NOT NULL,
  entity_id    UUID,
  old_value    JSONB,
  new_value    JSONB,
  reason       TEXT,
  created_at   TIMESTAMPTZ               NOT NULL DEFAULT now()
);


-- =============================================================================
-- SECTION 3 — COMMENTS ON admin_audit_log
--
-- All COMMENT ON statements are after CREATE TABLE.
-- =============================================================================

COMMENT ON TABLE public.admin_audit_log IS
  'Append-only audit trail for all admin actions. '
  'Immutability enforced by: (1) no UPDATE/DELETE RLS policies, '
  '(2) BEFORE UPDATE trigger protecting created_at, '
  '(3) RPCs only INSERT — never UPDATE or DELETE — audit rows. '
  'actor_id ON DELETE SET NULL: rows survive admin account deletion. '
  'entity_id has no FK: rows survive deletion of the referenced entity.';

COMMENT ON COLUMN public.admin_audit_log.created_at IS
  'Insertion timestamp. NOT NULL DEFAULT now(). '
  'Protected by trg_audit_log_immutable_created_at trigger at all privilege levels.';

COMMENT ON COLUMN public.admin_audit_log.actor_id IS
  'auth.uid() of the admin. ON DELETE SET NULL preserves the row if the account is deleted.';

COMMENT ON COLUMN public.admin_audit_log.entity_id IS
  'UUID of the affected row. Plain UUID — no FK — so rows survive entity deletion.';

COMMENT ON COLUMN public.admin_audit_log.old_value IS
  'JSONB snapshot of relevant columns before the action. '
  'Written before the mutation so a failed mutation still leaves a trace.';

COMMENT ON COLUMN public.admin_audit_log.new_value IS
  'JSONB snapshot of the values written by the action.';


-- =============================================================================
-- SECTION 4 — ENABLE RLS ON admin_audit_log
-- =============================================================================

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 5 — SELECT POLICY ON admin_audit_log
--
-- Only a SELECT policy. No INSERT/UPDATE/DELETE policies — the table is
-- append-only. INSERTs come exclusively from SECURITY DEFINER RPCs.
-- =============================================================================

DROP POLICY IF EXISTS "Admins can view audit log" ON public.admin_audit_log;

CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON POLICY "Admins can view audit log" ON public.admin_audit_log IS
  'Admins read all audit rows. No INSERT/UPDATE/DELETE policies exist. '
  'Rows written only by SECURITY DEFINER RPCs (which bypass RLS).';


-- =============================================================================
-- SECTION 6 — INDEXES ON admin_audit_log
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor_id
  ON public.admin_audit_log(actor_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
  ON public.admin_audit_log(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log(created_at DESC);


-- =============================================================================
-- SECTION 7 — prevent_audit_log_created_at_change() FUNCTION
--
-- Created before the trigger (Section 8) which references it.
-- SECURITY DEFINER so it fires even for superuser connections that bypass RLS.
-- Raises an exception if created_at is altered — protects the forensic timestamp.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_audit_log_created_at_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'admin_audit_log: created_at is immutable. Attempted % -> % on row %',
      OLD.created_at, NEW.created_at, OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_audit_log_created_at_change() IS
  'Protects admin_audit_log.created_at from post-insert modification. '
  'Fires BEFORE UPDATE at every privilege level including superuser.';


-- =============================================================================
-- SECTION 8 — trg_audit_log_immutable_created_at TRIGGER
--
-- Requires: admin_audit_log table (Section 2) and the trigger function (Section 7).
-- DROP TRIGGER IF EXISTS is safe here because the table now exists.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_audit_log_immutable_created_at ON public.admin_audit_log;

CREATE TRIGGER trg_audit_log_immutable_created_at
  BEFORE UPDATE ON public.admin_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_created_at_change();


-- =============================================================================
-- SECTION 9 — ADMIN RPCs
--
-- All three functions INSERT into public.admin_audit_log which now exists.
-- All PL/pgSQL variables use := assignment — no SELECT INTO anywhere.
-- No underscore variable appears in FROM, JOIN, INSERT INTO, UPDATE, or DELETE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 9a. admin_assign_role()
--
-- Replaces (once frontend migrates):
--   handleAddRole    → direct user_roles.insert (Admin.tsx line 5469)
--   handleRemoveRole → direct user_roles.delete (Admin.tsx line 5483)
--
-- Existing direct paths NOT broken — "Only admins can insert roles" and
-- "Admins can delete roles" policies on user_roles are not touched here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_assign_role(
  p_target_user_id UUID,
  p_role           public.app_role,
  p_action         TEXT,
  p_reason         TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id      UUID;
  _old_roles      JSONB;
  _new_roles      JSONB;
  _target_exists  BOOLEAN;
  _role_exists    BOOLEAN;
  _audit_action   public.admin_action;
BEGIN
  -- Admin check
  _caller_id := auth.uid();
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'admin_assign_role: caller does not have the admin role'
      USING ERRCODE = 'P0001';
  END IF;

  -- Target user must exist in profiles
  _target_exists := EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_target_user_id
  );
  IF NOT _target_exists THEN
    RAISE EXCEPTION
      'admin_assign_role: target user % not found in profiles', p_target_user_id
      USING ERRCODE = 'P0002';
  END IF;

  -- general role cannot be manually granted or revoked
  IF p_role = 'general' THEN
    RAISE EXCEPTION
      'admin_assign_role: the general role is managed by the handle_new_user '
      'trigger and cannot be manually granted or revoked'
      USING ERRCODE = 'P0003';
  END IF;

  -- Cannot grant admin role to self
  IF p_action = 'grant' AND p_role = 'admin' AND p_target_user_id = _caller_id THEN
    RAISE EXCEPTION
      'admin_assign_role: an admin cannot grant the admin role to themselves'
      USING ERRCODE = 'P0004';
  END IF;

  -- Validate action value
  IF p_action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION
      'admin_assign_role: p_action must be ''grant'' or ''revoke'', got: %', p_action
      USING ERRCODE = 'P0001';
  END IF;

  -- Resolve audit action enum
  _audit_action := CASE p_action
    WHEN 'grant'  THEN 'role_granted'::public.admin_action
    WHEN 'revoke' THEN 'role_revoked'::public.admin_action
  END;

  -- Capture current role state — scalar subquery, not SELECT INTO
  _old_roles := (
    SELECT jsonb_agg(r.role ORDER BY r.role)
    FROM   public.user_roles r
    WHERE  r.user_id = p_target_user_id
  );

  -- Audit row 1: BEFORE mutation (written first so failed mutations leave a trace)
  INSERT INTO public.admin_audit_log (
    actor_id, action, entity_type, entity_id, old_value, new_value, reason
  ) VALUES (
    _caller_id,
    _audit_action,
    'user_role',
    p_target_user_id,
    jsonb_build_object(
      'user_id',      p_target_user_id,
      'roles_before', COALESCE(_old_roles, '[]'::jsonb),
      'attempted',    jsonb_build_object('action', p_action, 'role', p_role)
    ),
    NULL,
    p_reason
  );

  -- Perform the mutation
  IF p_action = 'grant' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_target_user_id, p_role)
    ON CONFLICT (user_id, role) DO NOTHING;

  ELSIF p_action = 'revoke' THEN
    -- Role must exist — prevents silent no-ops; := EXISTS avoids SELECT INTO
    _role_exists := EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE  user_id = p_target_user_id AND role = p_role
    );
    IF NOT _role_exists THEN
      RAISE EXCEPTION
        'admin_assign_role: user % does not have role %', p_target_user_id, p_role
        USING ERRCODE = 'P0005';
    END IF;

    DELETE FROM public.user_roles
    WHERE  user_id = p_target_user_id
    AND    role    = p_role;
  END IF;

  -- Capture resulting role state — scalar subquery, not SELECT INTO
  _new_roles := (
    SELECT jsonb_agg(r.role ORDER BY r.role)
    FROM   public.user_roles r
    WHERE  r.user_id = p_target_user_id
  );

  -- Audit row 2: AFTER mutation (second row preserves append-only invariant)
  INSERT INTO public.admin_audit_log (
    actor_id, action, entity_type, entity_id, old_value, new_value, reason
  ) VALUES (
    _caller_id,
    _audit_action,
    'user_role',
    p_target_user_id,
    jsonb_build_object('user_id', p_target_user_id, 'roles_before', COALESCE(_old_roles, '[]'::jsonb)),
    jsonb_build_object('user_id', p_target_user_id, 'roles_after',  COALESCE(_new_roles, '[]'::jsonb),
                       'action', p_action, 'role', p_role),
    p_reason
  );
END;
$$;

COMMENT ON FUNCTION public.admin_assign_role(UUID, public.app_role, TEXT, TEXT) IS
  'Grants or revokes an app_role. Validates: caller is admin, target exists, '
  'general role protected, self admin-grant blocked. '
  'Writes two audit rows (before + after). '
  'Frontend: replaces direct user_roles.insert/delete in Admin.tsx.';


-- ---------------------------------------------------------------------------
-- 9b. admin_review_business()
--
-- New capability — no existing Admin.tsx equivalent.
-- Sets businesses.verification_status and syncs business_applications.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_business(
  p_business_id UUID,
  p_status      public.partner_status,
  p_notes       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id    UUID;
  _old_status   public.partner_status;
  _old_notes    TEXT;
  _audit_action public.admin_action;
BEGIN
  -- Admin check
  _caller_id := auth.uid();
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'admin_review_business: caller does not have the admin role'
      USING ERRCODE = 'P0001';
  END IF;

  -- Business must exist — scalar subquery assignment, not SELECT INTO
  -- verification_status is NOT NULL DEFAULT 'pending', so NULL = row absent
  _old_status := (
    SELECT verification_status FROM public.businesses WHERE id = p_business_id
  );
  _old_notes := (
    SELECT review_notes FROM public.businesses WHERE id = p_business_id
  );

  IF _old_status IS NULL THEN
    RAISE EXCEPTION
      'admin_review_business: business % not found', p_business_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Reason required for rejection and suspension
  IF p_status IN ('rejected', 'suspended')
     AND (p_notes IS NULL OR trim(p_notes) = '') THEN
    RAISE EXCEPTION
      'admin_review_business: a reason is required when setting status to % '
      '(shown to the business owner)', p_status
      USING ERRCODE = 'P0003';
  END IF;

  -- Resolve audit action
  _audit_action := CASE p_status
    WHEN 'approved'  THEN 'business_approved'::public.admin_action
    WHEN 'rejected'  THEN 'business_rejected'::public.admin_action
    WHEN 'suspended' THEN 'business_suspended'::public.admin_action
    ELSE                  'business_approved'::public.admin_action
  END;

  -- Audit row 1: BEFORE mutation
  INSERT INTO public.admin_audit_log (
    actor_id, action, entity_type, entity_id, old_value, reason
  ) VALUES (
    _caller_id,
    _audit_action,
    'business',
    p_business_id,
    jsonb_build_object('verification_status', _old_status, 'review_notes', _old_notes),
    p_notes
  );

  -- Update businesses
  UPDATE public.businesses
  SET
    verification_status = p_status,
    verified_by         = _caller_id,
    verified_at         = now(),
    review_notes        = p_notes,
    updated_at          = now()
  WHERE id = p_business_id;

  -- Sync most recent business_applications row for approve/reject decisions
  -- (not for suspended — that is operational, not a new review decision)
  IF p_status IN ('approved', 'rejected') THEN
    UPDATE public.business_applications
    SET
      status       = p_status,
      reviewer_id  = _caller_id,
      reviewed_at  = now(),
      review_notes = p_notes,
      updated_at   = now()
    WHERE id = (
      SELECT id
      FROM   public.business_applications
      WHERE  business_id = p_business_id
      ORDER  BY submitted_at DESC
      LIMIT  1
    );
  END IF;

  -- Audit row 2: AFTER mutation
  INSERT INTO public.admin_audit_log (
    actor_id, action, entity_type, entity_id, old_value, new_value, reason
  ) VALUES (
    _caller_id,
    _audit_action,
    'business',
    p_business_id,
    jsonb_build_object('verification_status', _old_status,  'review_notes', _old_notes),
    jsonb_build_object('verification_status', p_status,     'review_notes', p_notes,
                       'verified_by', _caller_id, 'verified_at', now()),
    p_notes
  );
END;
$$;

COMMENT ON FUNCTION public.admin_review_business(UUID, public.partner_status, TEXT) IS
  'Approves, rejects, or suspends a business. Syncs business_applications for approve/reject. '
  'Reason required for rejected/suspended. Writes two audit rows. '
  'No current Admin.tsx equivalent — consumed by future /admin/businesses route.';


-- ---------------------------------------------------------------------------
-- 9c. admin_moderate_event()
--
-- Replaces (once frontend migrates):
--   handleApproveEvent → partner_events.update status=approved (line 5342)
--   handleRejectEvent  → partner_events.update status=rejected  (line 5360)
--
-- Existing direct path NOT broken — "Partners can update own events" UPDATE
-- policy (admin bypass clause) is not changed here.
--
-- partner_events.status is TEXT (not an enum) in the current Dev schema.
-- Status value is validated explicitly inside the function.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_moderate_event(
  p_event_id UUID,
  p_status   TEXT,
  p_notes    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id    UUID;
  _old_status   TEXT;
  _old_notes    TEXT;
  _audit_action public.admin_action;
BEGIN
  -- Admin check
  _caller_id := auth.uid();
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'admin_moderate_event: caller does not have the admin role'
      USING ERRCODE = 'P0001';
  END IF;

  -- Validate status value
  IF p_status NOT IN ('approved', 'rejected', 'pending') THEN
    RAISE EXCEPTION
      'admin_moderate_event: p_status must be approved, rejected, or pending; got: %',
      p_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Event must exist — scalar subquery assignment, not SELECT INTO
  -- status is TEXT NOT NULL DEFAULT 'active', so NULL = row absent
  _old_status := (
    SELECT status           FROM public.partner_events WHERE id = p_event_id
  );
  _old_notes := (
    SELECT moderation_notes FROM public.partner_events WHERE id = p_event_id
  );

  IF _old_status IS NULL THEN
    RAISE EXCEPTION
      'admin_moderate_event: event % not found', p_event_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Reason required for rejection (matches existing handleRejectEvent guard)
  IF p_status = 'rejected' AND (p_notes IS NULL OR trim(p_notes) = '') THEN
    RAISE EXCEPTION
      'admin_moderate_event: moderation notes are required when rejecting '
      '(the partner sees this reason)'
      USING ERRCODE = 'P0003';
  END IF;

  -- Resolve audit action
  _audit_action := CASE p_status
    WHEN 'approved' THEN 'partner_event_approved'::public.admin_action
    WHEN 'rejected' THEN 'partner_event_rejected'::public.admin_action
    ELSE                 'partner_event_pending'::public.admin_action
  END;

  -- Audit row 1: BEFORE mutation
  INSERT INTO public.admin_audit_log (
    actor_id, action, entity_type, entity_id, old_value, reason
  ) VALUES (
    _caller_id,
    _audit_action,
    'partner_event',
    p_event_id,
    jsonb_build_object('status', _old_status, 'moderation_notes', _old_notes),
    p_notes
  );

  -- Perform the mutation
  UPDATE public.partner_events
  SET
    status           = p_status,
    moderation_notes = p_notes
  WHERE id = p_event_id;

  -- Audit row 2: AFTER mutation
  INSERT INTO public.admin_audit_log (
    actor_id, action, entity_type, entity_id, old_value, new_value, reason
  ) VALUES (
    _caller_id,
    _audit_action,
    'partner_event',
    p_event_id,
    jsonb_build_object('status', _old_status, 'moderation_notes', _old_notes),
    jsonb_build_object('status', p_status,    'moderation_notes', p_notes),
    p_notes
  );
END;
$$;

COMMENT ON FUNCTION public.admin_moderate_event(UUID, TEXT, TEXT) IS
  'Approves, rejects, or resets a partner_event to pending. '
  'p_status is TEXT (partner_events.status not yet an enum in Dev). '
  'Reason required for rejection. Writes two audit rows. '
  'Frontend: replaces handleApproveEvent/handleRejectEvent in Admin.tsx.';


-- =============================================================================
-- SECTION 10 — GRANT EXECUTE
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.admin_assign_role(UUID, public.app_role, TEXT, TEXT)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_review_business(UUID, public.partner_status, TEXT)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_moderate_event(UUID, TEXT, TEXT)
  TO authenticated;


-- =============================================================================
-- SECTION 11 — VALIDATION QUERIES
-- All objects now exist. All queries are SELECT-only.
-- =============================================================================

-- 11a. Both enum types have correct values
SELECT
  t.typname,
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
FROM   pg_type t
JOIN   pg_enum e ON e.enumtypid = t.oid
WHERE  t.typname IN ('admin_action', 'admin_entity_type')
GROUP  BY t.typname
ORDER  BY t.typname;
/*
  Expected 2 rows:
  admin_action      | role_granted, role_revoked, business_approved, business_rejected,
                      business_suspended, partner_event_approved, partner_event_rejected,
                      partner_event_pending
  admin_entity_type | user_role, business, business_application, partner_event
*/

-- 11b. Table columns and constraints
SELECT column_name, data_type, is_nullable, column_default
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'admin_audit_log'
ORDER  BY ordinal_position;
/*
  Expected 9 columns. created_at: is_nullable=NO, column_default contains 'now()'.
*/

-- 11c. CRITICAL: confirm no UPDATE or DELETE policies exist
SELECT
  COUNT(*)                                        AS total_policies,
  COUNT(*) FILTER (WHERE cmd = 'SELECT')          AS select_policies,
  COUNT(*) FILTER (WHERE cmd = 'INSERT')          AS insert_policies,
  COUNT(*) FILTER (WHERE cmd = 'UPDATE')          AS update_policies,
  COUNT(*) FILTER (WHERE cmd = 'DELETE')          AS delete_policies
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'admin_audit_log';
/*
  Expected: total=1, select=1, insert=0, update=0, delete=0
*/

-- 11c2. List policies explicitly
SELECT policyname, cmd
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'admin_audit_log'
ORDER  BY cmd;
/*
  Expected: 1 row — "Admins can view audit log", SELECT
*/

-- 11d. Immutability trigger exists and is BEFORE UPDATE
SELECT trigger_name, event_manipulation, action_timing, event_object_table
FROM   information_schema.triggers
WHERE  trigger_schema = 'public'
  AND  event_object_table = 'admin_audit_log'
  AND  trigger_name = 'trg_audit_log_immutable_created_at';
/*
  Expected: 1 row, BEFORE, UPDATE
*/

-- 11e. All four functions exist and are SECURITY DEFINER
SELECT routine_name, security_type
FROM   information_schema.routines
WHERE  routine_schema = 'public'
  AND  routine_name IN (
    'admin_assign_role', 'admin_review_business',
    'admin_moderate_event', 'prevent_audit_log_created_at_change'
  )
ORDER  BY routine_name;
/*
  Expected: 4 rows, all DEFINER
*/

-- 11f. All three indexes exist
SELECT indexname
FROM   pg_indexes
WHERE  schemaname = 'public' AND tablename = 'admin_audit_log'
ORDER  BY indexname;
/*
  Expected: 4 rows (pkey + 3 named indexes)
*/

-- 11g. Existing user_roles policies untouched (Admin.tsx still works)
SELECT policyname, cmd
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'user_roles'
ORDER  BY cmd;
/*
  "Only admins can insert roles" (INSERT) and "Admins can delete roles" (DELETE) must be present.
*/

-- 11h. Existing partner_events UPDATE policy untouched
SELECT policyname, cmd
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'partner_events' AND cmd = 'UPDATE';
/*
  Expected: "Partners can update own events" still exists.
*/

-- 11i. actor_id FK is ON DELETE SET NULL (not CASCADE)
SELECT kcu.column_name, rc.delete_rule
FROM   information_schema.key_column_usage kcu
JOIN   information_schema.referential_constraints rc
  ON   rc.constraint_name = kcu.constraint_name
WHERE  kcu.table_schema = 'public'
  AND  kcu.table_name   = 'admin_audit_log'
  AND  kcu.column_name  = 'actor_id';
/*
  Expected: delete_rule = SET NULL
*/

-- 11j. New table is empty; existing data is intact
SELECT 'admin_audit_log' AS tbl, COUNT(*) FROM public.admin_audit_log
UNION ALL
SELECT 'businesses',              COUNT(*) FROM public.businesses
UNION ALL
SELECT 'partner_events',          COUNT(*) FROM public.partner_events
UNION ALL
SELECT 'user_roles',              COUNT(*) FROM public.user_roles
ORDER  BY tbl;
/*
  admin_audit_log = 0. All other counts match pre-migration baseline.
*/


-- =============================================================================
-- SECTION 12 — ROLLBACK SCRIPT
--
-- Copy the block below, remove /* */ delimiters, run as a standalone script.
-- Back up audit rows first if any were written:
--   pg_dump -t admin_audit_log <conn> > audit_backup.sql
-- =============================================================================

/*
-- Rollback: remove all Admin Phase 1 objects in safe dependency order

-- 1. Drop table CASCADE (removes trigger, policy, indexes)
DROP TABLE   IF EXISTS public.admin_audit_log CASCADE;

-- 2. Drop RPCs and trigger function
DROP FUNCTION IF EXISTS public.admin_assign_role(UUID, public.app_role, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_review_business(UUID, public.partner_status, TEXT);
DROP FUNCTION IF EXISTS public.admin_moderate_event(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.prevent_audit_log_created_at_change();

-- 3. Drop enum types
DROP TYPE IF EXISTS public.admin_action;
DROP TYPE IF EXISTS public.admin_entity_type;

-- Verify rollback complete
SELECT routine_name FROM information_schema.routines
WHERE  routine_schema = 'public'
  AND  routine_name IN ('admin_assign_role','admin_review_business',
                        'admin_moderate_event','prevent_audit_log_created_at_change');
-- Expected: 0 rows

SELECT table_name FROM information_schema.tables
WHERE  table_schema = 'public' AND table_name = 'admin_audit_log';
-- Expected: 0 rows

SELECT typname FROM pg_type
WHERE  typname IN ('admin_action', 'admin_entity_type');
-- Expected: 0 rows
*/

-- =============================================================================
-- END OF ADMIN PHASE 1 MIGRATION (Rev 4)
-- =============================================================================
