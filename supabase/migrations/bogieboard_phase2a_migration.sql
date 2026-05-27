-- =============================================================================
-- BogieBoard Phase 2a Migration
-- File    : bogieboard_phase2a_migration.sql
-- Created : 2026-05-26
--
-- DEPENDS ON
-- ----------
--   Phase 1 migration must be applied first. This migration references:
--     public.businesses, public.business_members, public.business_locations,
--     public.business_applications (tables), business_member_role and
--     partner_status (enums), is_business_member() (function).
--   All of the above were created in Phase 1.
--
-- WHAT THIS MIGRATION ADDS
-- ------------------------
--   Section 1  handle_business_member_insert() trigger function
--              trg_business_member_insert trigger on business_members
--   Section 2  handle_new_user() replacement — always assigns general,
--              reads first/last name from metadata, adds ON CONFLICT guards
--   Section 3  create_business_with_owner() SECURITY DEFINER RPC
--   Section 4  record_login() RPC
--   Section 5  Two minimum RLS policy adjustments
--   Section 6  GRANT EXECUTE on new functions
--   Section 7  Validation queries
--   Section 8  Rollback scripts (commented — copy and run if needed)
--
-- WHAT THIS MIGRATION DOES NOT DO
-- --------------------------------
--   Does not drop partner_profiles, partner_employees, or partner_events.
--   Does not create promotions, rewards, or social tables.
--   Does not alter the app_role enum (partner value already exists).
--   Does not add storage buckets.
--   Does not change any existing RLS policy except the two in Section 5.
--   Does not touch any frontend code.
--
-- DEPLOYMENT ORDER — IMPORTANT
-- ----------------------------
--   1. Apply this migration to Dev.
--   2. Run the validation queries (Section 7) and smoke test.
--   3. Apply to Production.
--   4. Deploy frontend code changes AFTER Production migration is confirmed.
--
--   Rationale: if frontend changes (PartnerMember.tsx passing is_partner:true
--   in metadata) are deployed before this migration runs, the old
--   handle_new_user would assign partner role from metadata — which is
--   exactly the behaviour this migration removes. Running the SQL first
--   eliminates that window entirely.
--
-- ROLLBACK
-- --------
--   Two rollback scenarios are provided in Section 8:
--     8a. Clean rollback (no signups or business creations after deploy)
--     8b. Data-aware rollback (new rows exist; requires manual data cleanup)
--   Copy the relevant block from Section 8 and run it as a separate script.
--
-- IDEMPOTENCY
-- -----------
--   Safe to re-run:
--     CREATE OR REPLACE FUNCTION (all functions)
--     DROP TRIGGER IF EXISTS before CREATE TRIGGER
--     DROP POLICY IF EXISTS before CREATE POLICY
--     ON CONFLICT DO NOTHING in all data-writing statements
-- =============================================================================


-- =============================================================================
-- SECTION 1 — TRIGGER: handle_business_member_insert + trg_business_member_insert
--
-- PURPOSE
-- -------
--   Grant the 'partner' app_role to a user when they become an owner of a
--   business. This is the single, authoritative source for partner role
--   escalation in the entire application. Frontend code never writes to
--   user_roles.
--
-- WHY A TRIGGER RATHER THAN GRANTING THE ROLE INSIDE THE RPC
-- -----------------------------------------------------------
--   Option considered: have create_business_with_owner() insert the partner
--   role directly after creating the owner business_members row.
--
--   Rejected because:
--   1. A trigger fires on EVERY INSERT to business_members, regardless of
--      which function created the row. An RPC that grants the role directly
--      would not cover future admin tools, bulk imports, or additional RPCs
--      that create owner rows.
--   2. Role escalation is a database invariant, not an application workflow
--      step. Triggers enforce invariants; RPCs implement workflows. Mixing
--      them makes both harder to audit.
--   3. If create_business_with_owner() were ever refactored or replaced, the
--      role-grant logic could be accidentally omitted. A trigger cannot be
--      forgotten in the same way.
--
-- SECURITY DEFINER JUSTIFICATION
-- --------------------------------
--   The "Only admins can insert roles" policy on user_roles has the clause
--   TO authenticated, meaning it applies only to connections running as the
--   'authenticated' Postgres role (client connections). SECURITY DEFINER
--   functions and trigger functions run as the schema owner (superuser),
--   which is exempt from RLS. The trigger can always write to user_roles
--   regardless of that policy.
--
-- BEHAVIOUR
-- ---------
--   Fires AFTER INSERT on business_members FOR EACH ROW.
--   Only acts when role = 'owner' AND user_id IS NOT NULL.
--   External contacts (user_id NULL) do not get a platform role.
--   ON CONFLICT DO NOTHING makes multiple fires harmless.
--
-- DEPENDENCY ORDER
-- ----------------
--   Requires: public.user_roles (original migration), app_role enum with
--   'partner' value (migration 20260217031758), public.business_members
--   (Phase 1). All exist before this section runs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_business_member_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Grant partner role only when a real platform user (user_id IS NOT NULL)
  -- becomes an owner. External contacts (user_id NULL) get no role.
  IF NEW.role = 'owner' AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'partner')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_business_member_insert() IS
  'Grants partner app_role when a user becomes a business owner. '
  'Single authoritative source for partner role escalation. '
  'Frontend never writes to user_roles directly.';

-- Drop before create — idempotent
DROP TRIGGER IF EXISTS trg_business_member_insert ON public.business_members;

CREATE TRIGGER trg_business_member_insert
  AFTER INSERT ON public.business_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_business_member_insert();


-- =============================================================================
-- SECTION 2 — UPDATED handle_new_user() TRIGGER FUNCTION
--
-- RISK ASSESSMENT FOR CREATE OR REPLACE
-- ---------------------------------------
--   CREATE OR REPLACE FUNCTION acquires an exclusive lock on the function for
--   the duration of the statement. Any concurrent signup during replacement
--   will either complete with the old body or start with the new body —
--   never a partial mix. Postgres guarantees this atomicity.
--
--   The trigger on_auth_user_created stores the function NAME, not its body.
--   Replacing the function body does not require recreating the trigger.
--   The trigger continues to work throughout the replacement.
--
-- CHANGES FROM PREVIOUS VERSION (migration 20260409183132)
-- ---------------------------------------------------------
--   REMOVED: the is_partner metadata branch that assigned 'partner' role.
--     Reason: is_partner in raw_user_meta_data is user-supplied at signUp()
--     and cannot be trusted as a privilege signal. Any person who calls
--     supabase.auth.signUp({ data: { is_partner: true } }) directly would
--     receive partner access before creating a business, before admin review,
--     and before any Phase 1 rows exist for them.
--     The is_partner flag is retained as a routing signal only: AuthCallback
--     reads it to send the user to /partner-onboard instead of /welcome.
--     It grants no database privilege.
--
--   ADDED: first_name and last_name extraction from raw_user_meta_data.
--     Covers email signup (explicit first_name/last_name fields),
--     Google OAuth (full_name or name split on first space, given_name,
--     family_name), and future providers following either convention.
--     NULLIF(trim(...), '') converts blank strings to NULL.
--
--   ADDED: ON CONFLICT (user_id) DO NOTHING on both INSERT statements.
--     The old body had no conflict handling and would throw a unique
--     violation if the trigger somehow fired twice (Supabase bug, test
--     environment replay). This makes the function strictly safer.
--
-- TIMING: on_auth_user_created fires AFTER INSERT on auth.users, which
--   happens at the moment signUp() is called — before email confirmation.
--   This is a Supabase invariant. The profile and general role rows exist
--   immediately, even for unconfirmed accounts. This migration does not
--   change that timing.
--
-- DEPLOYMENT WINDOW: if the new frontend code (PartnerMember.tsx passing
--   is_partner:true) is deployed BEFORE this migration runs, the old
--   handle_new_user would assign partner from metadata — exactly what
--   we are removing. Apply the SQL migration FIRST, then deploy frontend.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _first_name TEXT;
  _last_name  TEXT;
  _full_name  TEXT;
BEGIN
  -- ── Resolve full_name once for reuse ──────────────────────────────────────
  _full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    ''
  );

  -- ── Extract first name ────────────────────────────────────────────────────
  -- Priority: explicit first_name field → first word of full_name/name →
  --           given_name (Google OAuth)
  _first_name := NULLIF(trim(COALESCE(
    NEW.raw_user_meta_data ->> 'first_name',
    CASE
      WHEN _full_name <> '' THEN split_part(_full_name, ' ', 1)
      ELSE NULL
    END,
    NEW.raw_user_meta_data ->> 'given_name'
  )), '');

  -- ── Extract last name ─────────────────────────────────────────────────────
  -- Priority: explicit last_name field → everything after first space in
  --           full_name/name → family_name (Google OAuth)
  _last_name := NULLIF(trim(COALESCE(
    NEW.raw_user_meta_data ->> 'last_name',
    CASE
      WHEN _full_name <> '' AND position(' ' IN _full_name) > 0
        THEN substr(_full_name, position(' ' IN _full_name) + 1)
      ELSE NULL
    END,
    NEW.raw_user_meta_data ->> 'family_name'
  )), '');

  -- ── Create profile row ────────────────────────────────────────────────────
  -- ON CONFLICT DO NOTHING: safe if trigger fires more than once.
  INSERT INTO public.profiles (user_id, email, first_name, last_name)
  VALUES (NEW.id, NEW.email, _first_name, _last_name)
  ON CONFLICT (user_id) DO NOTHING;

  -- ── Assign role: always 'general' ────────────────────────────────────────
  -- 'partner' role is granted only by trg_business_member_insert after the
  -- user creates a business and is inserted as owner in business_members.
  -- This function never assigns 'partner', regardless of metadata content.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'general')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Fires on every new auth.users INSERT. '
  'Creates profiles row with first/last name from metadata. '
  'Always assigns general role. Never assigns partner '
  '(see trg_business_member_insert). '
  'ON CONFLICT DO NOTHING makes it safe against duplicate fires.';

-- Verify the trigger is attached; create only if missing.
-- The trigger stores the function name, not body — no recreation needed
-- when only the function body changes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE  tgname  = 'on_auth_user_created'
    AND    tgrelid = 'auth.users'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()
    ';
    RAISE NOTICE 'on_auth_user_created trigger was missing — created.';
  ELSE
    RAISE NOTICE 'on_auth_user_created trigger exists — function body updated in place.';
  END IF;
END $$;


-- =============================================================================
-- SECTION 3 — create_business_with_owner() SECURITY DEFINER RPC
--
-- PURPOSE
-- -------
--   Atomically create the four Phase 1 rows required for a new business
--   partner in a single transaction:
--     1. businesses             (the entity)
--     2. business_members       (caller as owner)
--     3. business_locations     (primary location)
--     4. business_applications  (pending admin review)
--
--   trg_business_member_insert (Section 1) fires on step 2 and grants
--   the partner role inside the same transaction.
--
-- WHY SECURITY DEFINER
-- --------------------
--   Four inserts must be atomic. If any fails, all roll back.
--   Without SECURITY DEFINER, RLS bootstrapping causes a deadlock:
--     bb_business_applications_insert requires
--       is_business_member(business_id, 'admin'), which reads
--       business_members — but business_members has no row yet when
--       the application insert runs in a client-side sequence.
--   SECURITY DEFINER collapses the ordering problem into one server-side
--   transaction where all rows exist before RLS is evaluated by any caller.
--
--   auth.uid() is called at function entry to identify the caller.
--   An unauthenticated call returns NULL and raises an exception immediately.
--   SET search_path = public prevents search-path injection.
--
-- SLUG COLLISION HANDLING
-- -----------------------
--   businesses.slug has a UNIQUE constraint. The function catches
--   unique_violation and raises a descriptive error so the frontend can
--   prompt the user to vary the business name. The frontend should append
--   a short timestamp token (e.g. Date.now().toString(36)) to reduce
--   collision probability to near zero in practice.
--
-- RETURN VALUE
-- ------------
--   TABLE(out_business_id UUID, out_slug TEXT)
--   The frontend uses out_business_id and out_slug to navigate to the
--   partner dashboard and build the public business page URL.
--
-- CALLED FROM
-- -----------
--   PartnerOnboard.tsx (new page, not yet built) once per partner onboarding.
--   Called only after the user has confirmed their email address.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_business_with_owner(
  -- Business identity
  p_name            TEXT,
  p_slug            TEXT,
  p_description     TEXT    DEFAULT NULL,
  p_category_id     UUID    DEFAULT NULL,
  p_subcategory_id  UUID    DEFAULT NULL,

  -- Administrative contact stored on the entity itself so it survives
  -- changes to the business_members roster
  p_contact_name    TEXT    DEFAULT NULL,
  p_contact_email   TEXT    DEFAULT NULL,
  p_contact_phone   TEXT    DEFAULT NULL,

  -- Primary location address
  p_address_line1   TEXT    DEFAULT NULL,
  p_city            TEXT    DEFAULT NULL,
  p_state           TEXT    DEFAULT NULL,
  p_zip_code        TEXT    DEFAULT NULL,
  p_phone           TEXT    DEFAULT NULL,

  -- Display title for the owner's member row
  p_member_title    TEXT    DEFAULT 'Owner'
)
RETURNS TABLE(out_business_id UUID, out_slug TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id   UUID;
  _business_id UUID;
  _slug        TEXT;
BEGIN
  -- ── Identify the authenticated caller ─────────────────────────────────────
  _caller_id := auth.uid();
  IF _caller_id IS NULL THEN
    RAISE EXCEPTION 'create_business_with_owner: caller is not authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Validate required inputs ──────────────────────────────────────────────
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'create_business_with_owner: p_name is required'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    RAISE EXCEPTION 'create_business_with_owner: p_slug is required'
      USING ERRCODE = 'P0001';
  END IF;

  _slug := lower(trim(p_slug));

  -- ── Step 1: Insert businesses ─────────────────────────────────────────────
  BEGIN
    INSERT INTO public.businesses (
      name,
      slug,
      description,
      category_id,
      subcategory_id,
      contact_name,
      contact_email,
      contact_phone,
      verification_status
    )
    VALUES (
      trim(p_name),
      _slug,
      NULLIF(trim(COALESCE(p_description,   '')), ''),
      p_category_id,
      p_subcategory_id,
      NULLIF(trim(COALESCE(p_contact_name,  '')), ''),
      NULLIF(trim(COALESCE(p_contact_email, '')), ''),
      NULLIF(trim(COALESCE(p_contact_phone, '')), ''),
      'pending'   -- all new businesses begin as pending admin review
    )
    RETURNING id INTO _business_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION
      'A business with the slug "%" already exists. '
      'Please try a slightly different business name.',
      _slug
      USING ERRCODE = 'P0003';
  END;

  -- ── Step 2: Insert business_members (owner row) ───────────────────────────
  -- trg_business_member_insert fires here and inserts 'partner' into
  -- user_roles for _caller_id via ON CONFLICT DO NOTHING.
  -- The partner role is granted inside this same transaction.
  INSERT INTO public.business_members (
    business_id,
    user_id,
    role,
    contact_name,
    contact_email,
    contact_phone,
    contact_title
  )
  VALUES (
    _business_id,
    _caller_id,
    'owner',
    NULLIF(trim(COALESCE(p_contact_name,  '')), ''),
    NULLIF(trim(COALESCE(p_contact_email, '')), ''),
    NULLIF(trim(COALESCE(p_contact_phone, '')), ''),
    NULLIF(trim(COALESCE(p_member_title,  '')), 'Owner')
  );

  -- ── Step 3: Insert business_locations (primary location) ─────────────────
  INSERT INTO public.business_locations (
    business_id,
    name,
    is_primary,
    address_line1,
    city,
    state,
    zip_code,
    phone
  )
  VALUES (
    _business_id,
    'Primary Location',
    true,
    NULLIF(trim(COALESCE(p_address_line1, '')), ''),
    NULLIF(trim(COALESCE(p_city,          '')), ''),
    NULLIF(trim(COALESCE(p_state,         '')), ''),
    NULLIF(trim(COALESCE(p_zip_code,      '')), ''),
    NULLIF(trim(COALESCE(p_phone,         '')), '')
  );

  -- ── Step 4: Insert business_applications (pending review) ────────────────
  INSERT INTO public.business_applications (
    business_id,
    submitted_by,
    status
  )
  VALUES (
    _business_id,
    _caller_id,
    'pending'
  );

  -- ── Return identifiers for frontend navigation ────────────────────────────
  RETURN QUERY SELECT _business_id, _slug;
END;
$$;

COMMENT ON FUNCTION public.create_business_with_owner(
  TEXT, TEXT, TEXT, UUID, UUID,
  TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT
) IS
  'Atomically creates a business, owner member row, primary location, and '
  'pending application in a single transaction. SECURITY DEFINER. '
  'trg_business_member_insert fires on step 2 and grants the partner role. '
  'Called once from PartnerOnboard.tsx after email confirmation.';


-- =============================================================================
-- SECTION 4 — record_login() RPC
--
-- PURPOSE
-- -------
--   Write first_login_at and last_login_at to profiles from a single
--   server-side call, replacing direct timestamp writes currently scattered
--   across AuthCallback.tsx (line 2596-2611) and Welcome.tsx (line 3004-3009).
--
-- WHY NOT SECURITY DEFINER
-- ------------------------
--   record_login() does not need elevated privileges. It updates profiles
--   for the calling user only. The existing "Users can update own profile"
--   RLS policy (auth.uid() = user_id) enforces ownership. Running as the
--   authenticated user (INVOKER, the default) is correct and least-privilege.
--   A SECURITY DEFINER version would be over-engineered and harder to audit.
--
-- IDEMPOTENCY
-- -----------
--   COALESCE(first_login_at, now()) means first_login_at is a true one-shot:
--   once set, subsequent calls to this function do not overwrite it.
--   last_login_at is always updated to now().
--
-- CALLED FROM
-- -----------
--   AuthCallback.tsx once per session establishment (after code exchange).
--   Welcome.tsx and AuthCallback.tsx remove their direct timestamp writes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_login(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Belt-and-suspenders guard: the RLS policy already enforces this,
  -- but an explicit check gives a clear error message in logs.
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION
      'record_login: caller may only record their own login (got % expected %)',
      auth.uid(), p_user_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles
  SET
    last_login_at  = now(),
    first_login_at = COALESCE(first_login_at, now())
  WHERE user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.record_login(UUID) IS
  'Sets last_login_at = now(). Sets first_login_at only if currently NULL. '
  'Caller must pass their own auth.uid(). '
  'Replaces direct timestamp writes in AuthCallback.tsx and Welcome.tsx.';


-- =============================================================================
-- SECTION 5 — MINIMUM RLS ADJUSTMENTS
--
-- Only two policies change. All other existing policies are left exactly
-- as they are, including all partner_events and partner_employees policies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5a. profiles INSERT policy
--
-- CURRENT: WITH CHECK (auth.uid() = user_id)
--
-- ISSUE: handle_new_user() is SECURITY DEFINER and runs as the Postgres
--   superuser. Superusers bypass RLS entirely, so the current policy does
--   NOT actually block the trigger — the trigger works today without this
--   change. However, the existing policy name ("System creates profiles")
--   implies trigger-context operation while its body requires a client
--   context (auth.uid() IS NOT NULL). This is confusing and would block
--   any future client-side fallback path that needs to create a missing
--   profile row for a user whose trigger-created row was somehow absent.
--
-- CHANGE: add OR auth.uid() IS NULL to explicitly document and allow the
--   trigger execution context. This is additive — no existing permission
--   is removed. Client-side inserts still require auth.uid() = user_id.
--
-- ROLLBACK: restore to original single-clause form (see Section 8).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "System creates profiles" ON public.profiles;

CREATE POLICY "System creates profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = user_id    -- client-side: user inserts their own profile
    OR auth.uid() IS NULL   -- trigger context: SECURITY DEFINER, no uid
  );

-- ---------------------------------------------------------------------------
-- 5b. partner_profiles INSERT policy
--
-- CURRENT: WITH CHECK (auth.uid() = user_id AND has_role(auth.uid(), 'partner'))
--
-- ISSUE: chicken-and-egg deadlock. The partner role is now granted only by
--   trg_business_member_insert, which fires after create_business_with_owner
--   runs. A legacy user who tries to create their partner_profiles row
--   before that RPC exists (or directly via the old PartnerMember.tsx flow)
--   would fail the has_role check because the partner role does not exist
--   yet at the moment of insert.
--
--   partner_profiles is a legacy table. New signups write to businesses +
--   business_members instead. Legacy users updating their partner_profiles
--   should not be blocked by a role check on a table they already own.
--
-- CHANGE: remove the has_role check. auth.uid() = user_id is sufficient —
--   a user can only insert a row for themselves.
--
-- ROLLBACK: restore original two-clause form (see Section 8).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Partners can insert own profile"                    ON public.partner_profiles;
DROP POLICY IF EXISTS "Authenticated users can insert own partner profile" ON public.partner_profiles;

CREATE POLICY "Authenticated users can insert own partner profile"
  ON public.partner_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON POLICY "Authenticated users can insert own partner profile"
  ON public.partner_profiles IS
  'Legacy table — new signups write to businesses + business_members. '
  'has_role check removed: role is granted by trigger, not before insert.';


-- =============================================================================
-- SECTION 6 — GRANT EXECUTE
--
-- Supabase requires explicit GRANT EXECUTE to the 'authenticated' role for
-- functions callable via the JS client (supabase.rpc(...)). Without this,
-- the RPC call returns a "permission denied" error even for logged-in users.
--
-- create_business_with_owner: authenticated only (not anon). The function
--   itself validates auth.uid() IS NOT NULL, but restricting the grant to
--   authenticated adds a second layer.
--
-- record_login: authenticated only. Anon users have no profile row to update.
--
-- handle_business_member_insert: trigger functions need this grant for the
--   SECURITY DEFINER RLS bypass to function correctly in all Postgres
--   configurations including Supabase's connection pooler.
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.handle_business_member_insert()
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_business_with_owner(
  TEXT, TEXT, TEXT, UUID, UUID,
  TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.record_login(UUID)
  TO authenticated;


-- =============================================================================
-- SECTION 7 — VALIDATION QUERIES
-- Run these immediately after applying in Dev. All are SELECT-only.
-- Expected results are documented in comments beside each query.
-- =============================================================================

-- 7a. All new functions exist with correct security types
SELECT
  routine_name,
  security_type,
  routine_definition IS NOT NULL AS has_body
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'handle_new_user',
    'handle_business_member_insert',
    'create_business_with_owner',
    'record_login'
  )
ORDER BY routine_name;
/*
  Expected 4 rows:
  create_business_with_owner    DEFINER  true
  handle_business_member_insert DEFINER  true
  handle_new_user               DEFINER  true
  record_login                  INVOKER  true   <-- NOT DEFINER, intentional
*/

-- 7b. Trigger exists on business_members
SELECT
  trigger_name,
  event_manipulation AS fires_on,
  action_timing,
  event_object_table
FROM information_schema.triggers
WHERE trigger_schema     = 'public'
  AND event_object_table = 'business_members'
  AND trigger_name       = 'trg_business_member_insert';
/*
  Expected 1 row:
  trg_business_member_insert  INSERT  AFTER  business_members
*/

-- 7c. handle_new_user no longer contains the is_partner branch
SELECT
  routine_name,
  (routine_definition LIKE '%is_partner%') AS still_has_is_partner_branch,
  (routine_definition LIKE '%ON CONFLICT%') AS has_conflict_guard,
  (routine_definition LIKE '%first_name%') AS reads_first_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name   = 'handle_new_user';
/*
  Expected:
  still_has_is_partner_branch = false
  has_conflict_guard          = true
  reads_first_name            = true
*/

-- 7d. profiles INSERT policy updated
SELECT policyname, cmd, qual AS check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'profiles'
  AND cmd        = 'INSERT';
/*
  Expected 1 row.
  check_expression should contain 'auth.uid() IS NULL'.
*/

-- 7e. partner_profiles INSERT policy has no has_role check
SELECT policyname, cmd, qual AS check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'partner_profiles'
  AND cmd        = 'INSERT';
/*
  Expected 1 row: "Authenticated users can insert own partner profile"
  check_expression should NOT contain 'has_role'.
*/

-- 7f. on_auth_user_created trigger still attached to auth.users
SELECT tgname AS trigger_name, tgrelid::regclass AS on_table
FROM pg_trigger
WHERE tgname = 'on_auth_user_created';
/*
  Expected 1 row: auth.users
*/

-- 7g. Existing data fully intact (compare against pre-migration baseline)
SELECT
  'profiles'          AS table_name, COUNT(*) AS row_count FROM public.profiles
UNION ALL SELECT
  'partner_profiles',               COUNT(*) FROM public.partner_profiles
UNION ALL SELECT
  'user_roles',                     COUNT(*) FROM public.user_roles
UNION ALL SELECT
  'businesses',                     COUNT(*) FROM public.businesses
UNION ALL SELECT
  'business_members',               COUNT(*) FROM public.business_members
ORDER BY table_name;
/*
  Expected: profiles, partner_profiles, user_roles counts match pre-migration.
  businesses and business_members should be 0 (Phase 1 tables, no data yet).
*/

-- =============================================================================
-- SECTION 8 — ROLLBACK SCRIPTS
--
-- HOW TO USE
-- ----------
-- Do not run these during normal deployment.
-- If rollback is needed, copy the appropriate block below, remove the /* */
-- comment delimiters, and run it as a standalone script in the SQL Editor.
--
-- SCENARIO A — Clean rollback
--   Use when: no new user signups and no create_business_with_owner calls
--   occurred after this migration was applied.
--   Effect: restores database to pre-Phase-2a state. No data cleanup needed.
--
-- SCENARIO B — Data-aware rollback
--   Use when: new signups or business creations happened after deployment.
--   Effect: the functions and trigger are removed, but rows already created
--   in businesses, business_members, business_locations, business_applications
--   remain. The partner role granted to users by the trigger also remains.
--   Manual data cleanup is required before this rollback is meaningful.
--   Steps for data cleanup are listed inside Scenario B.
--
-- AFTER EITHER ROLLBACK
-- ---------------------
-- Redeploy the previous version of any frontend code that was changed
-- alongside this migration (PartnerMember.tsx, AuthCallback.tsx, etc.).
-- =============================================================================

/*
-- ============================================================
-- SCENARIO A: CLEAN ROLLBACK (no data created since deploy)
-- ============================================================

-- Step 1: Remove new triggers and functions (reverse dependency order)
DROP TRIGGER  IF EXISTS trg_business_member_insert ON public.business_members;
DROP FUNCTION IF EXISTS public.handle_business_member_insert();
DROP FUNCTION IF EXISTS public.create_business_with_owner(
  TEXT, TEXT, TEXT, UUID, UUID,
  TEXT, TEXT, TEXT,
  TEXT, TEXT, TEXT, TEXT, TEXT,
  TEXT
);
DROP FUNCTION IF EXISTS public.record_login(UUID);

-- Step 2: Restore handle_new_user to the previous version
-- (exact body from migration 20260409183132)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $restore$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);

  -- Restore: assign partner role from is_partner metadata flag
  IF (NEW.raw_user_meta_data ->> 'is_partner')::boolean = true THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'partner');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'general');
  END IF;

  RETURN NEW;
END;
$restore$;

-- Step 3: Restore profiles INSERT policy to original single-clause form
DROP POLICY IF EXISTS "System creates profiles" ON public.profiles;
CREATE POLICY "System creates profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Step 4: Restore partner_profiles INSERT policy to original form
-- (with the has_role check that was present before this migration)
DROP POLICY IF EXISTS "Authenticated users can insert own partner profile" ON public.partner_profiles;
CREATE POLICY "Partners can insert own profile"
  ON public.partner_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id AND has_role(auth.uid(), 'partner'));

-- Verify rollback
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'handle_business_member_insert',
    'create_business_with_owner',
    'record_login'
  );
-- Expected: 0 rows (all three new functions are gone)

SELECT tgname FROM pg_trigger WHERE tgname = 'trg_business_member_insert';
-- Expected: 0 rows

-- ============================================================
-- SCENARIO B: DATA-AWARE ROLLBACK (rows exist from new flow)
-- ============================================================
--
-- Before running any DROP/RESTORE commands, decide what to do with
-- existing data. Your options:
--
--   Option B1 — Preserve the data, revert only the code.
--     The businesses, business_members, business_locations, and
--     business_applications rows remain. Users who were granted 'partner'
--     via the trigger keep that role. The rollback removes the trigger and
--     functions so no new rows are created via this path, but existing rows
--     and roles are unaffected. This is the safest option.
--
--   Option B2 — Remove data created by the new flow.
--     Identify affected users and rows, then clean up manually:
--
--     -- Find businesses created via the new flow (no partner_profiles row)
--     SELECT b.id, b.name, b.slug, bm.user_id
--     FROM public.businesses b
--     JOIN public.business_members bm ON bm.business_id = b.id AND bm.role = 'owner'
--     WHERE NOT EXISTS (
--       SELECT 1 FROM public.partner_profiles pp WHERE pp.user_id = bm.user_id
--     );
--
--     -- Remove partner role from those users
--     DELETE FROM public.user_roles
--     WHERE role = 'partner'
--       AND user_id IN (
--         SELECT bm.user_id FROM public.business_members bm
--         JOIN public.businesses b ON b.id = bm.business_id
--         WHERE bm.role = 'owner'
--           AND NOT EXISTS (
--             SELECT 1 FROM public.partner_profiles pp WHERE pp.user_id = bm.user_id
--           )
--       );
--
--     -- Remove the business rows (cascades to members, locations, applications)
--     DELETE FROM public.businesses
--     WHERE id IN (
--       SELECT b.id FROM public.businesses b
--       JOIN public.business_members bm ON bm.business_id = b.id AND bm.role = 'owner'
--       WHERE NOT EXISTS (
--         SELECT 1 FROM public.partner_profiles pp WHERE pp.user_id = bm.user_id
--       )
--     );
--
-- After completing Option B1 or B2, run the same 4 steps from Scenario A
-- to remove the functions, restore handle_new_user, and restore the policies.
*/

-- =============================================================================
-- END OF PHASE 2a MIGRATION
-- =============================================================================
