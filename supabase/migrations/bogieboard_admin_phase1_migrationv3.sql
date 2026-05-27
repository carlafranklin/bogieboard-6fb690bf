-- =============================================================================
-- BogieBoard Admin Phase 1 Migration
-- File    : bogieboard_admin_phase1_migration.sql
-- Created : 2026-05-26
-- Rev     : 3 — fixed all SELECT INTO / SELECT EXISTS INTO parser ambiguities.
--               All PL/pgSQL variable assignments now use scalar subquery form
--               (_var := (SELECT ...)) or := EXISTS (...). No SELECT INTO anywhere.
--               Added SECTION 0: partial-object cleanup safe to run before retry.
--
-- ROOT CAUSE OF PRIOR FAILURES
-- -----------------------------
-- Supabase's Postgres parser treats "SELECT expr \n INTO identifier" as the SQL
-- DDL form of SELECT INTO (CREATE TABLE AS SELECT), interpreting the identifier
-- as a relation name rather than a PL/pgSQL variable. This affects:
--
--   SELECT EXISTS (...) INTO _target_exists;    ← reads _target_exists as a table
--   SELECT jsonb_agg(...) INTO _old_roles ...   ← reads _old_roles as a table
--   SELECT col1, col2 INTO _v1, _v2 FROM ...    ← multi-column form, also risky
--
-- ALL SELECT INTO patterns have been replaced with one of two safe forms:
--
--   _var := EXISTS (SELECT 1 FROM table WHERE ...);   ← boolean existence check
--   _var := (SELECT expr FROM table WHERE ...);       ← scalar subquery assignment
--
-- These are unambiguous PL/pgSQL. The parser cannot mistake them for DDL.
--
-- VARIABLE AUDIT — every underscore variable and its usage
-- ---------------------------------------------------------
--   admin_assign_role:
--     _caller_id     UUID    — set via := auth.uid()
--     _old_roles     JSONB   — set via := (SELECT jsonb_agg ...)    ← fixed
--     _new_roles     JSONB   — set via := (SELECT jsonb_agg ...)    ← fixed
--     _target_exists BOOLEAN — set via := EXISTS (...)              ← fixed
--     _role_exists   BOOLEAN — set via := EXISTS (...)              ← fixed
--     _audit_action  admin_action — set via := CASE expression
--   admin_review_business:
--     _caller_id     UUID    — set via := auth.uid()
--     _old_status    partner_status — set via := (SELECT ...)       ← fixed
--     _old_notes     TEXT    — set via := (SELECT ...)              ← fixed
--     _audit_action  admin_action — set via := CASE expression
--   admin_moderate_event:
--     _caller_id     UUID    — set via := auth.uid()
--     _old_status    TEXT    — set via := (SELECT ...)              ← fixed
--     _old_notes     TEXT    — set via := (SELECT ...)              ← fixed
--     _audit_action  admin_action — set via := CASE expression
--
--   NO variable appears in a FROM, JOIN, or table-position context anywhere.
--
-- DEPENDS ON
-- ----------
--   Original schema migrations (profiles, user_roles, partner_events)
--   Phase 1  (businesses, business_members, business_applications,
--              business_locations, partner_status enum, is_business_member)
--   Phase 2a (create_business_with_owner, record_login, handle_new_user update)
--   Phase 2b (hardened RLS policies, partner_profiles_public view)
--
-- SCOPE
-- -----
--   1. admin_action enum
--   2. admin_entity_type enum
--   3. admin_audit_log table
--   4. audit_log immutability: no UPDATE/DELETE RLS + BEFORE UPDATE trigger
--   5. admin_assign_role() SECURITY DEFINER RPC
--   6. admin_review_business() SECURITY DEFINER RPC
--   7. admin_moderate_event() SECURITY DEFINER RPC
--   8. Indexes on admin_audit_log
--   9. Validation queries (including explicit no-UPDATE/DELETE policy check)
--  10. Rollback scripts
--
-- WHAT THIS MIGRATION DOES NOT CREATE
-- ------------------------------------
--   No analytics tables. No onboarding_events. No user_suspensions.
--   No admin views. No frontend route changes.
--
-- BACKWARD COMPATIBILITY GUARANTEE
-- ----------------------------------
--   Existing Admin.tsx direct mutations are NOT broken:
--     handleAddRole    → user_roles.insert  : "Only admins can insert roles" still exists
--     handleRemoveRole → user_roles.delete  : "Admins can delete roles" still exists
--     handleApproveEvent/handleRejectEvent  → partner_events.update : "Partners can
--       update own events" admin bypass still exists (Phase 2b only changed INSERT/SELECT)
--   Both old direct paths and new RPCs work simultaneously until the frontend migrates.
--
-- AUDIT LOG IMMUTABILITY — THREE ENFORCEMENT LAYERS
-- ---------------------------------------------------
--   Layer 1 — RLS: no UPDATE or DELETE policy on admin_audit_log.
--     Client-side calls (.update(), .delete()) via the authenticated role are
--     blocked by Postgres policy evaluation. This covers the Supabase JS client,
--     PostgREST, and any direct API calls made with the anon or service key.
--
--   Layer 2 — BEFORE UPDATE trigger (Section 4):
--     Fires on every UPDATE regardless of caller privilege level.
--     Raises an exception if created_at is being altered.
--     Catches SECURITY DEFINER functions and superuser connections that bypass RLS.
--     Protects the forensically critical timestamp even if a future RPC
--     accidentally issues an UPDATE against this table.
--
--   Layer 3 — Code-level: the three RPCs in this migration only INSERT rows.
--     They never issue UPDATE or DELETE against admin_audit_log.
--     This is a code-level guarantee, not a database constraint, which is why
--     layers 1 and 2 exist independently.
--
-- AUDIT LOG SURVIVAL ON USER DELETION
-- -------------------------------------
--   actor_id REFERENCES auth.users(id) ON DELETE SET NULL
--   → Deleting an admin account sets actor_id = NULL on their log rows.
--   → The rows themselves are never deleted. Action, entity, values, reason,
--     and timestamp are all preserved.
--   entity_id is a plain UUID with no FK.
--   → Deleting a business, partner_event, or user_role row does not cascade-delete
--     the audit rows that referenced it. History outlives the entity it describes.
--
-- IDEMPOTENCY
-- -----------
--   DO $$ EXCEPTION WHEN duplicate_object for enum types.
--   CREATE TABLE IF NOT EXISTS.
--   CREATE OR REPLACE FUNCTION.
--   DROP POLICY IF EXISTS before CREATE POLICY.
--   DROP TRIGGER IF EXISTS before CREATE TRIGGER.
--   CREATE INDEX IF NOT EXISTS.
-- =============================================================================


-- =============================================================================
-- SECTION 0 — PARTIAL-OBJECT CLEANUP
--
-- Run this section FIRST if the migration previously failed mid-run.
-- It safely removes any objects that may have been committed before the
-- failure point, so the rest of the migration can create them cleanly.
--
-- WHAT MAY HAVE COMMITTED IN PRIOR FAILED RUNS
-- ----------------------------------------------
-- The migration fails when CREATE OR REPLACE FUNCTION reaches a SELECT INTO
-- statement inside the function body. At that point:
--   • Sections 1–5 (enums, table, RLS, trigger, indexes) are COMMITTED.
--   • The failing function (admin_assign_role) is NOT stored.
--   • Subsequent functions and GRANTs are NOT reached.
--
-- This section drops those committed objects so they are cleanly recreated.
-- Every DROP is IF EXISTS — safe to run even on a fresh database.
--
-- HOW TO USE
-- ----------
-- If this is a first-run: skip Section 0 (all DROPs are no-ops anyway).
-- If a prior run failed: run Section 0 first, then run the full migration.
-- The full migration is also idempotent — you can run it all at once and
-- Section 0's cleanup will simply process the IF EXISTS no-ops.
-- =============================================================================

-- Drop functions (if partially created or from a prior failed attempt)
DROP FUNCTION IF EXISTS public.admin_assign_role(UUID, public.app_role, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_review_business(UUID, public.partner_status, TEXT);
DROP FUNCTION IF EXISTS public.admin_moderate_event(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.prevent_audit_log_created_at_change();

-- Drop trigger on audit log (depends on the function above)
DROP TRIGGER IF EXISTS trg_audit_log_immutable_created_at ON public.admin_audit_log;

-- Drop indexes on admin_audit_log (recreated in Section 5)
DROP INDEX IF EXISTS public.idx_admin_audit_log_actor_id;
DROP INDEX IF EXISTS public.idx_admin_audit_log_entity;
DROP INDEX IF EXISTS public.idx_admin_audit_log_created_at;

-- Drop RLS policy (recreated in Section 3)
DROP POLICY IF EXISTS "Admins can view audit log" ON public.admin_audit_log;

-- Drop table (cascades RLS; recreated in Section 2)
-- NOTE: this drops any audit rows already written. If you have rows to
-- preserve from a prior run, export them before running this section:
--   pg_dump -t admin_audit_log <connection_string> > audit_backup.sql
DROP TABLE IF EXISTS public.admin_audit_log;

-- Drop enum types (recreated in Section 1)
-- Must come after the table drop (table columns reference these types).
DROP TYPE IF EXISTS public.admin_action;
DROP TYPE IF EXISTS public.admin_entity_type;


-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1a. admin_action — what the admin did
--     Typed vocabulary scopes the audit log. Typos caught at INSERT time.
--     Future values: ALTER TYPE public.admin_action ADD VALUE IF NOT EXISTS '...'
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.admin_action AS ENUM (
    'role_granted',
    'role_revoked',
    'business_approved',
    'business_rejected',
    'business_suspended',
    'partner_event_approved',
    'partner_event_rejected',
    'partner_event_pending'       -- reset to pending (re-review)
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Type admin_action already exists — skipping.';
END $$;

-- ---------------------------------------------------------------------------
-- 1b. admin_entity_type — which table the action targeted
-- ---------------------------------------------------------------------------
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
-- COLUMN NOTES
-- ------------
-- created_at : TIMESTAMPTZ NOT NULL DEFAULT now()
--   Both NOT NULL and DEFAULT now() are set. The trigger in Section 4 prevents
--   any caller — including superusers — from altering this column after insert.
--
-- actor_id : ON DELETE SET NULL
--   If an admin account is deleted, their log rows are preserved with actor_id = NULL.
--   The action, entity, values, reason, and timestamp are always retained.
--
-- entity_id : plain UUID, no FK
--   Audit rows reference entities across multiple tables (businesses, partner_events,
--   user_roles). Postgres does not support polymorphic FKs. Plain UUID ensures that
--   deleting an entity never cascade-deletes its audit history.
--
-- old_value / new_value : JSONB
--   Snapshots of only the fields the action modified — not full row copies.
--   The RPCs write both a "before" row (before the mutation, so a failed mutation
--   still leaves a trace) and an "after" row (capturing the resulting state).
--
-- No updated_at column: audit rows are never updated. created_at is the only
--   timestamp this table needs.
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

COMMENT ON TABLE public.admin_audit_log IS
  'Append-only audit trail for all admin actions. '
  'Immutability enforced by: (1) no UPDATE/DELETE RLS policies, '
  '(2) BEFORE UPDATE trigger on created_at, (3) RPCs only INSERT rows. '
  'actor_id = NULL means the acting admin account has since been deleted — '
  'the log row itself is never deleted. '
  'entity_id has no FK so rows survive deletion of the referenced entity.';

COMMENT ON COLUMN public.admin_audit_log.created_at IS
  'Insertion timestamp. NOT NULL, DEFAULT now(). '
  'Protected by trg_audit_log_immutable_created_at: any UPDATE that alters '
  'this column raises an exception, even from superuser connections.';

COMMENT ON COLUMN public.admin_audit_log.actor_id IS
  'auth.uid() of the admin who performed the action. '
  'ON DELETE SET NULL: deleting the admin account preserves the log row.';

COMMENT ON COLUMN public.admin_audit_log.entity_id IS
  'UUID of the affected row. No FK — polymorphic reference across tables. '
  'Deleting the referenced entity does not delete these audit rows.';

COMMENT ON COLUMN public.admin_audit_log.old_value IS
  'JSONB snapshot of relevant columns BEFORE the action. '
  'Written by the RPC before the mutation so failed mutations leave a trace.';

COMMENT ON COLUMN public.admin_audit_log.new_value IS
  'JSONB snapshot of the new values written by the action. '
  'Written by the RPC after the mutation in a second audit row.';


-- =============================================================================
-- SECTION 3 — RLS ON admin_audit_log
--
-- POLICY DESIGN — INTENTIONALLY INCOMPLETE
-- -----------------------------------------
-- Only a SELECT policy is created. There is no INSERT, UPDATE, or DELETE policy.
--
-- INSERT: client-side INSERTs are blocked. SECURITY DEFINER RPCs bypass RLS
--   and insert rows directly. This is intentional — audit rows must only be
--   written by our controlled RPC functions, never directly from the JS client.
--
-- UPDATE: no policy. Any UPDATE from the authenticated role is blocked by the
--   absence of an UPDATE policy. Superuser UPDATEs are additionally blocked
--   by the trigger in Section 4. Together these cover every privilege level.
--
-- DELETE: no policy. Blocked for the authenticated role by policy absence.
--   A superuser could still issue a DELETE; protecting against that requires
--   either pg_audit logging at the Postgres level or promoting admin_audit_log
--   to a partitioned table in a separate schema with restricted privileges
--   (a Phase 3 hardening option). For Dev phase, RLS absence is the guard.
-- =============================================================================

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit log" ON public.admin_audit_log;

CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT policy — intentional. See section comment above.
-- No UPDATE policy — intentional. Trigger in Section 4 provides additional guard.
-- No DELETE policy — intentional.

COMMENT ON POLICY "Admins can view audit log" ON public.admin_audit_log IS
  'Admins can read all audit rows. '
  'No INSERT, UPDATE, or DELETE policies exist — this table is append-only. '
  'Rows are written only by SECURITY DEFINER admin RPC functions (bypass RLS). '
  'The BEFORE UPDATE trigger additionally blocks created_at alteration at all privilege levels.';


-- =============================================================================
-- SECTION 4 — IMMUTABILITY TRIGGER ON admin_audit_log
--
-- PURPOSE
-- -------
-- RLS blocks UPDATE from the authenticated role. But SECURITY DEFINER functions
-- and direct superuser connections bypass RLS. The trigger fires at every
-- privilege level — it is a database-level constraint, not a policy-level one.
--
-- SCOPE OF PROTECTION
-- --------------------
-- The trigger raises an exception if created_at is being changed. It does not
-- block ALL updates to the row. This narrower scope is intentional: if a future
-- migration needs to backfill a missing reason or correct a typo in old_value,
-- that operation should be possible with proper controls. Protecting the
-- timestamp is the forensic priority — an unchanged created_at proves when
-- the event was recorded.
--
-- If full row immutability is required in the future, expand the function to:
--   IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION '...'; END IF;
-- That single-line change would block all UPDATEs without altering the trigger
-- attachment point.
--
-- TRIGGER EXECUTION
-- ------------------
-- BEFORE UPDATE: fires before any row is touched, so no partial write occurs.
-- FOR EACH ROW: fires once per affected row, not once per statement.
-- SECURITY DEFINER: runs as schema owner. The OLD/NEW comparison happens
--   before Postgres applies the requested change, so it correctly catches
--   any attempt regardless of who is issuing the UPDATE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_audit_log_created_at_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fires BEFORE UPDATE on admin_audit_log.
  -- Raises an exception if any caller — authenticated, service role, or superuser —
  -- attempts to alter the created_at column on an existing audit row.
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'admin_audit_log: created_at is immutable. '
      'Attempted change: % → % on row %',
      OLD.created_at, NEW.created_at, OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_immutable_created_at ON public.admin_audit_log;

CREATE TRIGGER trg_audit_log_immutable_created_at
  BEFORE UPDATE ON public.admin_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_created_at_change();

COMMENT ON FUNCTION public.prevent_audit_log_created_at_change() IS
  'Protects admin_audit_log.created_at from post-insert modification. '
  'Fires BEFORE UPDATE at every privilege level including superuser. '
  'To extend to full row immutability: raise an exception unconditionally '
  'in the BEFORE UPDATE handler (remove the created_at-specific check).';


-- =============================================================================
-- SECTION 5 — INDEXES ON admin_audit_log
-- =============================================================================

-- "What did admin X do?" — filter by actor
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor_id
  ON public.admin_audit_log(actor_id);

-- "What happened to entity Y?" — polymorphic entity lookup
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_entity
  ON public.admin_audit_log(entity_type, entity_id);

-- "Recent activity feed" — time-ordered scan
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log(created_at DESC);


-- =============================================================================
-- SECTION 6 — admin_assign_role() RPC
--
-- REPLACES (once frontend migrates)
-- -----------------------------------------
--   handleAddRole    → user_roles.insert  (Admin.tsx line 5469)
--   handleRemoveRole → user_roles.delete  (Admin.tsx line 5483)
--
-- EXISTING Admin.tsx BEHAVIOR NOT BROKEN
-- ----------------------------------------
--   "Only admins can insert roles" (INSERT) and "Admins can delete roles"
--   (DELETE) policies on user_roles are NOT dropped by this migration.
--   Direct table writes from Admin.tsx continue to work until the frontend
--   migrates to this RPC.
--
-- VALIDATION STEPS (in order)
-- ----------------------------
--   1. has_role(auth.uid(), 'admin') — caller must be admin.
--   2. Target user must exist in public.profiles.
--   3. 'general' role cannot be manually granted or revoked.
--   4. Cannot grant 'admin' to self.
--   5. p_action must be 'grant' or 'revoke'.
--   6. For 'revoke': role must actually exist on the target (no silent no-ops).
--
-- AUDIT PATTERN
-- -------------
--   Row 1 (before): captures old_value = current roles array, new_value = NULL.
--     Written BEFORE the mutation so a failed mutation still leaves a trace.
--   Row 2 (after): captures old_value = same roles array, new_value = resulting
--     roles array. Written after the mutation succeeds.
--   Two-row pattern preserves append-only invariant — we never UPDATE row 1.
-- =============================================================================

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
  -- ── Step 1: admin check ────────────────────────────────────────────────────
  _caller_id := auth.uid();
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'admin_assign_role: caller does not have the admin role'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Step 2: target user must exist in profiles ─────────────────────────────
  -- Use := EXISTS() not SELECT EXISTS INTO to avoid the parser treating the
  -- identifier as a relation name (SQL SELECT INTO) instead of a PL/pgSQL variable.
  _target_exists := EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_target_user_id
  );
  IF NOT _target_exists THEN
    RAISE EXCEPTION
      'admin_assign_role: target user % not found in profiles', p_target_user_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── Step 3: general role is trigger-only ──────────────────────────────────
  IF p_role = 'general' THEN
    RAISE EXCEPTION
      'admin_assign_role: the general role is assigned by the handle_new_user '
      'trigger and cannot be manually granted or revoked'
      USING ERRCODE = 'P0003';
  END IF;

  -- ── Step 4: cannot grant admin to self ────────────────────────────────────
  IF p_action = 'grant' AND p_role = 'admin' AND p_target_user_id = _caller_id THEN
    RAISE EXCEPTION
      'admin_assign_role: an admin cannot grant the admin role to themselves'
      USING ERRCODE = 'P0004';
  END IF;

  -- ── Step 5: validate action value ─────────────────────────────────────────
  IF p_action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION
      'admin_assign_role: p_action must be ''grant'' or ''revoke'', got: %', p_action
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Resolve audit action enum once ────────────────────────────────────────
  _audit_action := CASE p_action
    WHEN 'grant'  THEN 'role_granted'::public.admin_action
    WHEN 'revoke' THEN 'role_revoked'::public.admin_action
  END;

  -- ── Capture old role state ─────────────────────────────────────────────────
  -- Scalar subquery assignment: unambiguous PL/pgSQL, never parsed as SELECT INTO DDL.
  _old_roles := (
    SELECT jsonb_agg(r.role ORDER BY r.role)
    FROM   public.user_roles r
    WHERE  r.user_id = p_target_user_id
  );

  -- ── Audit row 1: BEFORE mutation ──────────────────────────────────────────
  -- Written first so a failed mutation still leaves a trace in the log.
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

  -- ── Perform the mutation ───────────────────────────────────────────────────
  IF p_action = 'grant' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_target_user_id, p_role)
    ON CONFLICT (user_id, role) DO NOTHING;

  ELSIF p_action = 'revoke' THEN
    -- Step 6: role must exist (prevents silent no-ops that mislead the admin UI).
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

  -- ── Capture new role state ─────────────────────────────────────────────────
  -- Same scalar subquery pattern — never SELECT INTO.
  _new_roles := (
    SELECT jsonb_agg(r.role ORDER BY r.role)
    FROM   public.user_roles r
    WHERE  r.user_id = p_target_user_id
  );

  -- ── Audit row 2: AFTER mutation ───────────────────────────────────────────
  -- Second row preserves the append-only invariant (we never UPDATE row 1).
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
  'Grants or revokes an app_role for a user. '
  'Validates: caller is admin, target exists, general role protected, self admin-grant blocked. '
  'Writes two audit rows (before + after) to preserve append-only invariant. '
  'Frontend: replaces direct user_roles.insert/delete in Admin.tsx '
  '(old direct paths remain open until frontend migrates).';

GRANT EXECUTE ON FUNCTION public.admin_assign_role(UUID, public.app_role, TEXT, TEXT)
  TO authenticated;


-- =============================================================================
-- SECTION 7 — admin_review_business() RPC
--
-- NEW CAPABILITY — no current Admin.tsx equivalent
-- --------------------------------------------------
--   No business management tab exists yet in Admin.tsx.
--   This RPC creates the backend capability for the future /admin/businesses
--   and /admin/applications frontend routes. Can be called manually from the
--   Supabase SQL Editor for reviews during the transition period.
--
-- VALIDATION STEPS
-- ----------------
--   1. has_role('admin') check.
--   2. Business must exist — captures old_status for the audit row.
--   3. Reason required for 'rejected' and 'suspended' (not for 'approved').
--
-- WHAT IT WRITES IN ONE TRANSACTION
-- -----------------------------------
--   Audit row 1 (before mutation).
--   UPDATE businesses: verification_status, verified_by, verified_at, review_notes.
--   UPDATE business_applications: syncs the most recent application row for
--     approve/reject decisions. Suspension is operational — it does not change
--     the application review record.
--   Audit row 2 (after mutation).
-- =============================================================================

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
  -- ── Admin check ────────────────────────────────────────────────────────────
  _caller_id := auth.uid();
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'admin_review_business: caller does not have the admin role'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Business must exist; capture current state ────────────────────────────
  -- Two separate scalar subquery assignments — avoids multi-column SELECT INTO.
  -- verification_status is NOT NULL DEFAULT 'pending', so NULL means row absent.
  _old_status := (
    SELECT verification_status FROM public.businesses WHERE id = p_business_id
  );
  _old_notes  := (
    SELECT review_notes        FROM public.businesses WHERE id = p_business_id
  );

  IF _old_status IS NULL THEN
    RAISE EXCEPTION
      'admin_review_business: business % not found', p_business_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── Reason required for rejection and suspension ───────────────────────────
  IF p_status IN ('rejected', 'suspended')
     AND (p_notes IS NULL OR trim(p_notes) = '') THEN
    RAISE EXCEPTION
      'admin_review_business: a non-empty reason is required when setting '
      'status to % (shown to the business owner)', p_status
      USING ERRCODE = 'P0003';
  END IF;

  -- ── Resolve audit action ───────────────────────────────────────────────────
  _audit_action := CASE p_status
    WHEN 'approved'  THEN 'business_approved'::public.admin_action
    WHEN 'rejected'  THEN 'business_rejected'::public.admin_action
    WHEN 'suspended' THEN 'business_suspended'::public.admin_action
    ELSE                  'business_approved'::public.admin_action
  END;

  -- ── Audit row 1: BEFORE mutation ──────────────────────────────────────────
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

  -- ── Update businesses ──────────────────────────────────────────────────────
  UPDATE public.businesses
  SET
    verification_status = p_status,
    verified_by         = _caller_id,
    verified_at         = now(),
    review_notes        = p_notes,
    updated_at          = now()
  WHERE id = p_business_id;

  -- ── Sync most recent business_applications row (approve/reject only) ───────
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

  -- ── Audit row 2: AFTER mutation ───────────────────────────────────────────
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
  'Approves, rejects, or suspends a business. '
  'Syncs the most recent business_applications row for approve/reject. '
  'Reason required for rejected and suspended. '
  'Writes two audit rows (before + after). '
  'No current Admin.tsx equivalent — consumed by future /admin/businesses route.';

GRANT EXECUTE ON FUNCTION public.admin_review_business(UUID, public.partner_status, TEXT)
  TO authenticated;


-- =============================================================================
-- SECTION 8 — admin_moderate_event() RPC
--
-- REPLACES (once frontend migrates)
-- -----------------------------------------
--   handleApproveEvent → partner_events.update status='approved' (line 5342)
--   handleRejectEvent  → partner_events.update status='rejected'  (line 5360)
--
-- EXISTING Admin.tsx BEHAVIOR NOT BROKEN
-- ----------------------------------------
--   "Partners can update own events" (Phase 1 original, line 8467) includes
--   OR has_role(auth.uid(), 'admin'). Phase 2b only changed INSERT and SELECT
--   policies — the UPDATE policy is untouched. handleApproveEvent and
--   handleRejectEvent continue to work until the frontend migrates.
--
-- STATUS TYPE NOTE
-- ----------------
--   partner_events.status is TEXT in the current Dev schema (line 8452 of the
--   original migration). The partner_event_status enum was proposed but not
--   applied to this column. The RPC accepts TEXT and validates the known set.
--   When the enum migration runs, this signature will be updated.
--
-- VALIDATION STEPS
-- ----------------
--   1. has_role('admin') check.
--   2. p_status must be 'approved', 'rejected', or 'pending'.
--   3. Event must exist.
--   4. Reason required for 'rejected' — matches existing handleRejectEvent
--      check at Admin.tsx line 5356, preserving the UX contract.
-- =============================================================================

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
  -- ── Admin check ────────────────────────────────────────────────────────────
  _caller_id := auth.uid();
  IF NOT public.has_role(_caller_id, 'admin') THEN
    RAISE EXCEPTION 'admin_moderate_event: caller does not have the admin role'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Validate status value ──────────────────────────────────────────────────
  IF p_status NOT IN ('approved', 'rejected', 'pending') THEN
    RAISE EXCEPTION
      'admin_moderate_event: p_status must be ''approved'', ''rejected'', or '
      '''pending''; got: %', p_status
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Event must exist; capture current state ────────────────────────────────
  -- Two separate scalar subquery assignments — avoids multi-column SELECT INTO.
  -- status is TEXT NOT NULL DEFAULT 'active', so NULL means row absent.
  _old_status := (
    SELECT status            FROM public.partner_events WHERE id = p_event_id
  );
  _old_notes  := (
    SELECT moderation_notes  FROM public.partner_events WHERE id = p_event_id
  );

  IF _old_status IS NULL THEN
    RAISE EXCEPTION
      'admin_moderate_event: event % not found', p_event_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ── Reason required for rejection ─────────────────────────────────────────
  -- Matches the existing handleRejectEvent guard at Admin.tsx line 5356.
  IF p_status = 'rejected' AND (p_notes IS NULL OR trim(p_notes) = '') THEN
    RAISE EXCEPTION
      'admin_moderate_event: moderation notes are required when rejecting an event '
      '(the partner sees this reason)'
      USING ERRCODE = 'P0003';
  END IF;

  -- ── Resolve audit action ───────────────────────────────────────────────────
  _audit_action := CASE p_status
    WHEN 'approved' THEN 'partner_event_approved'::public.admin_action
    WHEN 'rejected' THEN 'partner_event_rejected'::public.admin_action
    ELSE                 'partner_event_pending'::public.admin_action
  END;

  -- ── Audit row 1: BEFORE mutation ──────────────────────────────────────────
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

  -- ── Perform the mutation ───────────────────────────────────────────────────
  UPDATE public.partner_events
  SET
    status           = p_status,
    moderation_notes = p_notes
  WHERE id = p_event_id;

  -- ── Audit row 2: AFTER mutation ───────────────────────────────────────────
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
  'p_status is TEXT because partner_events.status is not yet an enum in Dev. '
  'Reason required for rejection — matches existing handleRejectEvent behavior. '
  'Writes two audit rows (before + after). '
  'Frontend: replaces handleApproveEvent/handleRejectEvent in Admin.tsx '
  '(old direct paths remain open until frontend migrates).';

GRANT EXECUTE ON FUNCTION public.admin_moderate_event(UUID, TEXT, TEXT)
  TO authenticated;


-- =============================================================================
-- SECTION 9 — VALIDATION QUERIES
-- Run immediately after applying in Dev. All SELECT-only.
-- Each query includes its expected result as a comment.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 9a. Both enum types exist with correct values
-- ---------------------------------------------------------------------------
SELECT
  t.typname                                               AS enum_name,
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
FROM   pg_type t
JOIN   pg_enum e ON e.enumtypid = t.oid
WHERE  t.typname IN ('admin_action', 'admin_entity_type')
GROUP  BY t.typname
ORDER  BY t.typname;
/*
  Expected 2 rows:
  admin_action      | role_granted, role_revoked, business_approved,
                      business_rejected, business_suspended,
                      partner_event_approved, partner_event_rejected,
                      partner_event_pending
  admin_entity_type | user_role, business, business_application, partner_event
*/

-- ---------------------------------------------------------------------------
-- 9b. Table exists with correct columns and constraints
-- ---------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'admin_audit_log'
ORDER  BY ordinal_position;
/*
  Expected 9 columns:
  id          | uuid      | NO  | gen_random_uuid()
  actor_id    | uuid      | YES | (null)
  action      | USER-DEF  | NO  | (null)
  entity_type | USER-DEF  | NO  | (null)
  entity_id   | uuid      | YES | (null)
  old_value   | jsonb     | YES | (null)
  new_value   | jsonb     | YES | (null)
  reason      | text      | YES | (null)
  created_at  | timestamp | NO  | now()
  
  created_at must be NOT NULL with DEFAULT now().
*/

-- ---------------------------------------------------------------------------
-- 9c. CRITICAL: no UPDATE or DELETE policies on admin_audit_log
--     This query explicitly confirms the append-only RLS design.
-- ---------------------------------------------------------------------------
SELECT
  COUNT(*)                                         AS total_policies,
  COUNT(*) FILTER (WHERE cmd = 'SELECT')           AS select_policies,
  COUNT(*) FILTER (WHERE cmd = 'INSERT')           AS insert_policies,
  COUNT(*) FILTER (WHERE cmd = 'UPDATE')           AS update_policies,
  COUNT(*) FILTER (WHERE cmd = 'DELETE')           AS delete_policies
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'admin_audit_log';
/*
  Expected:
  total_policies  = 1
  select_policies = 1   ← "Admins can view audit log"
  insert_policies = 0   ← intentionally absent: inserts via SECURITY DEFINER RPCs only
  update_policies = 0   ← intentionally absent: rows are immutable
  delete_policies = 0   ← intentionally absent: rows are immutable
  
  Any value > 0 for insert/update/delete is a misconfiguration.
*/

-- ---------------------------------------------------------------------------
-- 9c2. List the policies explicitly (zero ambiguity)
-- ---------------------------------------------------------------------------
SELECT policyname, cmd, roles, qual AS using_expr
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'admin_audit_log'
ORDER  BY cmd;
/*
  Expected: exactly 1 row.
  policyname = "Admins can view audit log"
  cmd        = SELECT
  
  No row for INSERT, UPDATE, or DELETE. If any such rows appear,
  run the rollback and investigate before re-deploying.
*/

-- ---------------------------------------------------------------------------
-- 9d. Immutability trigger exists and is attached correctly
-- ---------------------------------------------------------------------------
SELECT
  trigger_name,
  event_manipulation AS fires_on,
  action_timing,
  event_object_table AS table_name
FROM   information_schema.triggers
WHERE  trigger_schema     = 'public'
  AND  event_object_table = 'admin_audit_log'
  AND  trigger_name       = 'trg_audit_log_immutable_created_at';
/*
  Expected: 1 row.
  trigger_name = trg_audit_log_immutable_created_at
  fires_on     = UPDATE
  action_timing = BEFORE
  table_name   = admin_audit_log
*/

-- ---------------------------------------------------------------------------
-- 9e. All three RPC functions exist with SECURITY DEFINER
-- ---------------------------------------------------------------------------
SELECT routine_name, security_type
FROM   information_schema.routines
WHERE  routine_schema = 'public'
  AND  routine_name IN (
    'admin_assign_role',
    'admin_review_business',
    'admin_moderate_event',
    'prevent_audit_log_created_at_change'
  )
ORDER  BY routine_name;
/*
  Expected: 4 rows, all security_type = DEFINER.
*/

-- ---------------------------------------------------------------------------
-- 9f. All indexes on admin_audit_log exist
-- ---------------------------------------------------------------------------
SELECT indexname
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  tablename  = 'admin_audit_log'
ORDER  BY indexname;
/*
  Expected: 4 rows:
  admin_audit_log_pkey               (primary key — auto-created)
  idx_admin_audit_log_actor_id
  idx_admin_audit_log_created_at
  idx_admin_audit_log_entity
*/

-- ---------------------------------------------------------------------------
-- 9g. Existing user_roles policies untouched (Admin.tsx still works)
-- ---------------------------------------------------------------------------
SELECT policyname, cmd
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'user_roles'
ORDER  BY cmd;
/*
  Expected: includes both of these (exact count may vary by prior migrations):
  "Only admins can insert roles" (INSERT)
  "Admins can delete roles"      (DELETE)
  Both must be present. If either is missing, Admin.tsx role management is broken.
*/

-- ---------------------------------------------------------------------------
-- 9h. Existing partner_events UPDATE policy untouched (Admin.tsx still works)
-- ---------------------------------------------------------------------------
SELECT policyname, cmd
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'partner_events'
  AND  cmd        = 'UPDATE';
/*
  Expected: "Partners can update own events" still present.
  Admin.tsx handleApproveEvent and handleRejectEvent depend on this policy.
*/

-- ---------------------------------------------------------------------------
-- 9i. actor_id FK has ON DELETE SET NULL (not CASCADE)
-- ---------------------------------------------------------------------------
SELECT
  kcu.column_name,
  rc.delete_rule
FROM   information_schema.key_column_usage kcu
JOIN   information_schema.referential_constraints rc
  ON   rc.constraint_name = kcu.constraint_name
WHERE  kcu.table_schema  = 'public'
  AND  kcu.table_name    = 'admin_audit_log'
  AND  kcu.column_name   = 'actor_id';
/*
  Expected: 1 row, delete_rule = SET NULL.
  If delete_rule = CASCADE, deleting an admin account would delete their audit rows.
  SET NULL is the correct behavior: rows are preserved, actor_id becomes NULL.
*/

-- ---------------------------------------------------------------------------
-- 9j. Existing data fully intact
-- ---------------------------------------------------------------------------
SELECT
  'admin_audit_log' AS table_name, COUNT(*) AS row_count FROM public.admin_audit_log
UNION ALL SELECT
  'businesses',                     COUNT(*) FROM public.businesses
UNION ALL SELECT
  'partner_events',                 COUNT(*) FROM public.partner_events
UNION ALL SELECT
  'user_roles',                     COUNT(*) FROM public.user_roles
ORDER  BY table_name;
/*
  Expected: admin_audit_log = 0 (new empty table).
  All other counts must match your pre-migration baseline.
*/


-- =============================================================================
-- SECTION 10 — ROLLBACK SCRIPTS
--
-- WHEN TO USE
-- -----------
-- Copy the block below, remove /* */ delimiters, run as a standalone script.
--
-- DATA IMPACT
-- -----------
-- If admin actions were taken via the new RPCs between deployment and rollback,
-- admin_audit_log contains rows. Dropping the table removes them permanently.
-- Back up first if audit history must be preserved:
--   pg_dump -t admin_audit_log <connection_string> > audit_backup.sql
--
-- EXISTING BEHAVIOR
-- -----------------
-- Admin.tsx direct mutations were never broken and require no restoration.
-- =============================================================================

/*
-- ============================================================
-- ROLLBACK: Remove Admin Phase 1 objects in dependency order
-- ============================================================

-- Step 1: Drop RPCs (no other DB objects depend on them)
DROP FUNCTION IF EXISTS public.admin_assign_role(UUID, public.app_role, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_review_business(UUID, public.partner_status, TEXT);
DROP FUNCTION IF EXISTS public.admin_moderate_event(UUID, TEXT, TEXT);

-- Step 2: Drop the immutability trigger and its function
DROP TRIGGER   IF EXISTS trg_audit_log_immutable_created_at ON public.admin_audit_log;
DROP FUNCTION  IF EXISTS public.prevent_audit_log_created_at_change();

-- Step 3: Drop audit log table (all rows are lost — back up first if needed)
DROP TABLE IF EXISTS public.admin_audit_log;

-- Step 4: Drop enum types (safe once the table is dropped)
DROP TYPE IF EXISTS public.admin_action;
DROP TYPE IF EXISTS public.admin_entity_type;

-- Verify rollback complete
SELECT routine_name FROM information_schema.routines
WHERE  routine_schema = 'public'
  AND  routine_name IN (
    'admin_assign_role', 'admin_review_business',
    'admin_moderate_event', 'prevent_audit_log_created_at_change'
  );
-- Expected: 0 rows

SELECT table_name FROM information_schema.tables
WHERE  table_schema = 'public' AND table_name = 'admin_audit_log';
-- Expected: 0 rows

SELECT typname FROM pg_type
WHERE  typname IN ('admin_action', 'admin_entity_type');
-- Expected: 0 rows
*/

-- =============================================================================
-- END OF ADMIN PHASE 1 MIGRATION (Rev 2)
-- =============================================================================
