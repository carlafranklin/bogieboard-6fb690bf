-- =============================================================================
-- BogieBoard Phase 1 Migration
-- File : bogieboard_phase1_migration.sql
-- Date : 2026-05-26
-- Rev  : 2 — fixed creation order (is_business_member moved after business_members)
--
-- Scope
-- -----
-- Adds the four foundational tables for the v2 business model alongside the
-- existing schema. Nothing existing is dropped, altered, or replaced.
-- No triggers on auth.users are touched. No existing RLS policies are changed.
-- No enum values are added to app_role.
--
-- Tables created
-- --------------
--   public.businesses             — canonical business entity (no user_id)
--   public.business_members       — user ↔ business junction with roles
--   public.business_locations     — one business → many physical locations
--   public.business_applications  — admin review queue
--
-- Enums created
-- -------------
--   public.business_member_role   — owner | admin | staff
--   public.partner_status         — pending | approved | suspended | rejected
--
-- Helper functions created
-- ------------------------
--   public.update_updated_at_column()  — already exists; pinned with CREATE OR REPLACE
--   public.is_business_member()        — SECURITY DEFINER; created AFTER business_members
--
-- Creation order (dependency-safe)
-- ---------------------------------
--   1. Enums
--   2. update_updated_at_column()          ← no table dependency
--   3. businesses table
--   4. business_members table              ← FK → businesses
--   5. is_business_member()               ← references business_members; must be here
--   6. business_locations table           ← FK → businesses
--   7. business_applications table        ← FK → businesses
--   8. Indexes
--   9. RLS enable + policies              ← calls is_business_member(); safe now
--  10. Triggers
--  11. Validation queries
--
-- What this migration does NOT do
-- --------------------------------
--   • Does not touch auth.users trigger (handle_new_user)
--   • Does not modify partner_profiles, partner_events, or their policies
--   • Does not add columns to profiles or partner_events
--   • Does not create promotions, redemptions, loyalty_cards, user_follows
--   • Does not create storage buckets
--   • Does not change app_role enum
--   • Does not replace any existing RLS policy
--
-- Idempotency
-- -----------
--   Safe to re-run. Uses:
--     CREATE TABLE IF NOT EXISTS
--     CREATE INDEX IF NOT EXISTS
--     DO $$ EXCEPTION WHEN duplicate_object  (enums)
--     CREATE OR REPLACE FUNCTION            (functions)
--     DROP POLICY IF EXISTS before CREATE POLICY
--     DROP TRIGGER IF EXISTS before CREATE TRIGGER
-- =============================================================================


-- =============================================================================
-- STEP 1 — ENUMS
-- Must come before any table or function that references them.
-- Postgres has no CREATE TYPE IF NOT EXISTS, so we use the DO/EXCEPTION guard.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1a. business_member_role
--     The three access tiers within a business:
--       owner  — created the business; can transfer ownership and delete.
--       admin  — manages events, promotions, locations, and staff.
--       staff  — can verify consumer redemptions at point of sale.
--
--     Hierarchy enforced by is_business_member() in Step 5:
--       'staff' passes for staff, admin, or owner.
--       'admin' passes for admin or owner.
--       'owner' passes for owner only.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.business_member_role AS ENUM ('owner', 'admin', 'staff');
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Type business_member_role already exists — skipping.';
END $$;

-- ---------------------------------------------------------------------------
-- 1b. partner_status
--     Lifecycle of a business account or application:
--       pending   — awaiting admin review (default).
--       approved  — account is live and visible to consumers.
--       suspended — temporarily blocked by admin.
--       rejected  — review failed; business may reapply.
--
--     Used on both businesses.verification_status and
--     business_applications.status for consistent vocabulary.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.partner_status AS ENUM (
    'pending',
    'approved',
    'suspended',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Type partner_status already exists — skipping.';
END $$;


-- =============================================================================
-- STEP 2 — update_updated_at_column()
-- This function has no table dependencies so it can stay early.
-- Already exists in the DB; CREATE OR REPLACE pins it to a known state.
-- Existing triggers that reference it are unaffected.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- =============================================================================
-- STEP 3 — businesses table
-- No dependency on business_members; must be created before it.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.businesses (
  id                  UUID                  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identity
  name                TEXT                  NOT NULL,
  slug                TEXT                  NOT NULL UNIQUE,
  description         TEXT,

  -- Classification (FK to existing tables)
  category_id         UUID                  REFERENCES public.categories(id)    ON DELETE SET NULL,
  subcategory_id      UUID                  REFERENCES public.subcategories(id) ON DELETE SET NULL,

  -- Media
  logo_url            TEXT,
  cover_url           TEXT,

  -- Web / social presence
  website             TEXT,
  social_facebook     TEXT,
  social_instagram    TEXT,
  social_twitter      TEXT,
  social_linkedin     TEXT,

  -- Administrative contact (stored on the entity so it survives member changes)
  contact_name        TEXT,
  contact_email       TEXT,
  contact_phone       TEXT,

  -- Verification workflow
  verification_status public.partner_status NOT NULL DEFAULT 'pending',
  verified_by         UUID                  REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at         TIMESTAMPTZ,
  review_notes        TEXT,

  -- Timestamps
  created_at          TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ           NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.businesses IS
  'Canonical business entity. No direct user_id column — '
  'user linkage is via business_members. '
  'Phase 1: new partner sign-ups write here. '
  'Phase 2: existing partner_profiles rows are backfilled into this table.';

COMMENT ON COLUMN public.businesses.slug IS
  'URL-safe unique identifier, e.g. "joes-bar-raleigh". '
  'Generated by the application layer at creation time.';

COMMENT ON COLUMN public.businesses.verification_status IS
  'pending → approved (or rejected) by admin. '
  'suspended = was approved but temporarily blocked by admin action.';

COMMENT ON COLUMN public.businesses.verified_by IS
  'auth.users.id of the admin who last changed verification_status.';


-- =============================================================================
-- STEP 4 — business_members table
-- FK → businesses (Step 3). Must exist before is_business_member() (Step 5).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.business_members (
  id            UUID                        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Which business this membership belongs to
  business_id   UUID                        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- The BogieBoard user (NULL for external contacts without an account)
  user_id       UUID                        REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Role within this business
  role          public.business_member_role NOT NULL DEFAULT 'staff',

  -- Lightweight contact fields (used when user_id IS NULL, or as display override)
  contact_name  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_title TEXT,

  -- Audit: who invited this member
  invited_by    UUID                        REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at     TIMESTAMPTZ                 NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ                 NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_members IS
  'User ↔ business junction. One row per (user, business) pair. '
  'user_id is nullable for external contacts who do not hold a BogieBoard account. '
  'Role hierarchy enforced by is_business_member(): owner > admin > staff.';

COMMENT ON COLUMN public.business_members.user_id IS
  'NULL = external contact (no BogieBoard account). '
  'Non-null = authenticated user with platform access to this business.';

COMMENT ON COLUMN public.business_members.role IS
  'owner  : full control, can delete and transfer. '
  'admin  : manages events, promotions, locations, staff. '
  'staff  : verifies consumer redemptions at point of sale.';

-- Unique constraint on (business_id, user_id) for real users only.
-- NULL user_ids (external contacts) are excluded from uniqueness enforcement.
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_members_business_user
  ON public.business_members(business_id, user_id)
  WHERE user_id IS NOT NULL;


-- =============================================================================
-- STEP 5 — is_business_member()
-- Created HERE, after business_members exists, so the function body can
-- reference public.business_members without a "relation does not exist" error.
--
-- SECURITY DEFINER: runs with schema-owner privileges so RLS policies can
-- call it without recursive policy evaluation or permission escalation.
-- SET search_path = public: prevents search-path injection attacks.
-- STABLE: result does not change within a single statement; planner may cache.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_business_member(
  _business_id UUID,
  _min_role    public.business_member_role
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.business_members bm
    WHERE  bm.business_id = _business_id
    AND    bm.user_id     = auth.uid()
    AND    CASE _min_role
             WHEN 'staff' THEN bm.role IN ('staff', 'admin', 'owner')
             WHEN 'admin' THEN bm.role IN ('admin', 'owner')
             WHEN 'owner' THEN bm.role =  'owner'
           END
  );
$$;


-- =============================================================================
-- STEP 6 — business_locations table
-- FK → businesses (Step 3). Created after is_business_member() (Step 5)
-- so the PostGIS trigger function that references it is also in the right order.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.business_locations (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id   UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- Human-readable label for this location
  name          TEXT        NOT NULL DEFAULT 'Primary Location',

  -- Only one row per business should be primary (enforced by partial unique index below)
  is_primary    BOOLEAN     NOT NULL DEFAULT false,

  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  state         TEXT,
  zip_code      TEXT,
  country       TEXT        NOT NULL DEFAULT 'US',
  phone         TEXT,

  -- Coordinates (populated by application or geocoder)
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  -- PostGIS geography column added conditionally below

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_locations IS
  'Physical locations for a business. Supports multi-location businesses. '
  'PostGIS geography column (location) added conditionally below. '
  'Phase 2: promotions and partner_events will gain a location_id FK here.';

COMMENT ON COLUMN public.business_locations.is_primary IS
  'Exactly one row per business should be TRUE. '
  'Enforced by the partial unique index uq_business_locations_one_primary.';

-- One primary location per business enforced at the DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_locations_one_primary
  ON public.business_locations(business_id)
  WHERE is_primary = true;

-- Conditionally add PostGIS geography column.
-- Mirrors the pattern used for venues.location in migration 20260213191409.
-- Raises a WARNING (not an error) if PostGIS is unavailable so the rest
-- of the migration continues to run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
    AND    table_name   = 'business_locations'
    AND    column_name  = 'location'
  ) THEN
    EXECUTE '
      ALTER TABLE public.business_locations
        ADD COLUMN location extensions.geography(Point, 4326)
    ';
    RAISE NOTICE 'PostGIS column business_locations.location created.';
  ELSE
    RAISE NOTICE 'PostGIS column business_locations.location already exists — skipping.';
  END IF;
EXCEPTION WHEN others THEN
  RAISE WARNING
    'Could not add PostGIS column to business_locations: %. '
    'Proximity search will be unavailable until PostGIS is enabled.',
    SQLERRM;
END $$;


-- =============================================================================
-- STEP 7 — business_applications table
-- FK → businesses (Step 3). Last table — no other table depends on it.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.business_applications (
  id            UUID                  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Which business this application is for
  business_id   UUID                  NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- Who submitted (must be an owner/admin of the business)
  submitted_by  UUID                  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Review state (starts pending; admin sets approved/rejected/suspended)
  status        public.partner_status NOT NULL DEFAULT 'pending',

  -- Admin review fields (null until reviewed)
  reviewer_id   UUID                  REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  review_notes  TEXT,

  submitted_at  TIMESTAMPTZ           NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ           NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_applications IS
  'Admin review queue for partner onboarding. '
  'One row per submission attempt — rejected applicants create a new row to reapply. '
  'Phase 3 will add a trigger that syncs approval to businesses.verification_status.';

COMMENT ON COLUMN public.business_applications.status IS
  'Admin sets this. Phase 3 trigger will propagate the decision '
  'to businesses.verification_status automatically.';


-- =============================================================================
-- STEP 8 — INDEXES
-- All four tables are now created so all FK indexes are safe to define.
-- All use CREATE INDEX IF NOT EXISTS for idempotency.
-- Naming convention: idx_{table}_{column(s)}
-- =============================================================================

-- businesses
CREATE INDEX IF NOT EXISTS idx_businesses_verification_status
  ON public.businesses(verification_status);

CREATE INDEX IF NOT EXISTS idx_businesses_category_id
  ON public.businesses(category_id);

CREATE INDEX IF NOT EXISTS idx_businesses_created_at
  ON public.businesses(created_at DESC);

-- business_members
-- Note: uq_business_members_business_user (Step 4) already covers (business_id, user_id).
CREATE INDEX IF NOT EXISTS idx_business_members_business_id
  ON public.business_members(business_id);

CREATE INDEX IF NOT EXISTS idx_business_members_user_id
  ON public.business_members(user_id)
  WHERE user_id IS NOT NULL;

-- "Which businesses does this user have admin access to?" — used by dashboard query
CREATE INDEX IF NOT EXISTS idx_business_members_user_role
  ON public.business_members(user_id, role)
  WHERE user_id IS NOT NULL;

-- business_locations
CREATE INDEX IF NOT EXISTS idx_business_locations_business_id
  ON public.business_locations(business_id);

CREATE INDEX IF NOT EXISTS idx_business_locations_city
  ON public.business_locations(city);

-- Conditional PostGIS GIST spatial index
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
    AND    table_name   = 'business_locations'
    AND    column_name  = 'location'
  ) AND NOT EXISTS (
    SELECT 1
    FROM   pg_indexes
    WHERE  schemaname = 'public'
    AND    tablename  = 'business_locations'
    AND    indexname  = 'idx_business_locations_gist'
  ) THEN
    EXECUTE 'CREATE INDEX idx_business_locations_gist
             ON public.business_locations USING GIST(location)';
    RAISE NOTICE 'PostGIS GIST index created on business_locations.location.';
  END IF;
END $$;

-- business_applications
CREATE INDEX IF NOT EXISTS idx_business_applications_business_id
  ON public.business_applications(business_id);

CREATE INDEX IF NOT EXISTS idx_business_applications_submitted_by
  ON public.business_applications(submitted_by);

CREATE INDEX IF NOT EXISTS idx_business_applications_status
  ON public.business_applications(status);

-- Admin review queue: most recent pending applications first
CREATE INDEX IF NOT EXISTS idx_business_applications_pending
  ON public.business_applications(submitted_at DESC)
  WHERE status = 'pending';


-- =============================================================================
-- STEP 9 — ROW LEVEL SECURITY
-- All four tables exist and is_business_member() is defined, so policies
-- that call it are safe to create here.
-- =============================================================================

-- Enable RLS (idempotent — safe to re-run if already enabled)
ALTER TABLE public.businesses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_locations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_applications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 9a. businesses
--
--   SELECT : approved businesses are public. Pending/suspended/rejected are
--            visible only to their own members and to platform admins.
--   INSERT : any authenticated user — role is conferred after the owner
--            member row is inserted (same transaction, Step 9b INSERT policy).
--   UPDATE : members with at least 'admin' role, or platform admins.
--   DELETE : platform admins only (historical records must be preserved).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "bb_businesses_select" ON public.businesses;
DROP POLICY IF EXISTS "bb_businesses_insert" ON public.businesses;
DROP POLICY IF EXISTS "bb_businesses_update" ON public.businesses;
DROP POLICY IF EXISTS "bb_businesses_delete" ON public.businesses;

CREATE POLICY "bb_businesses_select"
  ON public.businesses FOR SELECT
  USING (
    verification_status = 'approved'
    OR public.is_business_member(id, 'staff')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "bb_businesses_insert"
  ON public.businesses FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "bb_businesses_update"
  ON public.businesses FOR UPDATE
  USING (
    public.is_business_member(id, 'admin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "bb_businesses_delete"
  ON public.businesses FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 9b. business_members
--
--   SELECT : any member of the business (any role) can see the member list.
--            Platform admins see all rows.
--   INSERT : existing admins/owners can add members.
--            A user can also self-insert their own owner row during the
--            initial business creation flow (bootstrapping edge case).
--            Phase 3 will move this to a SECURITY DEFINER trigger.
--   UPDATE : business admins/owners and platform admins.
--   DELETE : business admins/owners and platform admins.
--            (Phase 3 will add a guard trigger preventing deletion of the
--            last owner row.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "bb_business_members_select" ON public.business_members;
DROP POLICY IF EXISTS "bb_business_members_insert" ON public.business_members;
DROP POLICY IF EXISTS "bb_business_members_update" ON public.business_members;
DROP POLICY IF EXISTS "bb_business_members_delete" ON public.business_members;

CREATE POLICY "bb_business_members_select"
  ON public.business_members FOR SELECT
  USING (
    public.is_business_member(business_id, 'staff')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "bb_business_members_insert"
  ON public.business_members FOR INSERT
  WITH CHECK (
    public.is_business_member(business_id, 'admin')
    OR public.has_role(auth.uid(), 'admin')
    -- Self-insert of own owner row during initial business creation
    OR (user_id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "bb_business_members_update"
  ON public.business_members FOR UPDATE
  USING (
    public.is_business_member(business_id, 'admin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "bb_business_members_delete"
  ON public.business_members FOR DELETE
  USING (
    public.is_business_member(business_id, 'admin')
    OR public.has_role(auth.uid(), 'admin')
  );

-- ---------------------------------------------------------------------------
-- 9c. business_locations
--
--   SELECT : public — location data is not sensitive.
--   INSERT/UPDATE/DELETE : business admins/owners and platform admins.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "bb_business_locations_select" ON public.business_locations;
DROP POLICY IF EXISTS "bb_business_locations_insert" ON public.business_locations;
DROP POLICY IF EXISTS "bb_business_locations_update" ON public.business_locations;
DROP POLICY IF EXISTS "bb_business_locations_delete" ON public.business_locations;

CREATE POLICY "bb_business_locations_select"
  ON public.business_locations FOR SELECT
  USING (true);

CREATE POLICY "bb_business_locations_insert"
  ON public.business_locations FOR INSERT
  WITH CHECK (
    public.is_business_member(business_id, 'admin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "bb_business_locations_update"
  ON public.business_locations FOR UPDATE
  USING (
    public.is_business_member(business_id, 'admin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "bb_business_locations_delete"
  ON public.business_locations FOR DELETE
  USING (
    public.is_business_member(business_id, 'admin')
    OR public.has_role(auth.uid(), 'admin')
  );

-- ---------------------------------------------------------------------------
-- 9d. business_applications
--
--   SELECT : submitter sees their own; platform admins see all.
--   INSERT : submitter must be owner/admin of the referenced business.
--   UPDATE : platform admins only (they set reviewer_id, reviewed_at, status).
--   DELETE : platform admins only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "bb_business_applications_select" ON public.business_applications;
DROP POLICY IF EXISTS "bb_business_applications_insert" ON public.business_applications;
DROP POLICY IF EXISTS "bb_business_applications_update" ON public.business_applications;
DROP POLICY IF EXISTS "bb_business_applications_delete" ON public.business_applications;

CREATE POLICY "bb_business_applications_select"
  ON public.business_applications FOR SELECT
  USING (
    submitted_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "bb_business_applications_insert"
  ON public.business_applications FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid()
    AND public.is_business_member(business_id, 'admin')
  );

CREATE POLICY "bb_business_applications_update"
  ON public.business_applications FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "bb_business_applications_delete"
  ON public.business_applications FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));


-- =============================================================================
-- STEP 10 — TRIGGERS
-- Only updated_at maintenance triggers in Phase 1.
-- Business-logic triggers (owner-row auto-creation, last-owner guard,
-- application decision propagation) are deferred to Phase 3.
-- business_members intentionally has no updated_at column or trigger.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_businesses_updated_at            ON public.businesses;
DROP TRIGGER IF EXISTS trg_business_locations_updated_at    ON public.business_locations;
DROP TRIGGER IF EXISTS trg_business_applications_updated_at ON public.business_applications;

CREATE TRIGGER trg_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_business_locations_updated_at
  BEFORE UPDATE ON public.business_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_business_applications_updated_at
  BEFORE UPDATE ON public.business_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Conditionally create the PostGIS auto-populate trigger on business_locations.
-- Mirrors trg_venues_set_location from migration 20260213191409.
-- Skipped silently if the location column was not created (PostGIS unavailable).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
    AND    table_name   = 'business_locations'
    AND    column_name  = 'location'
  ) THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION public.business_locations_set_location()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, extensions
      AS $inner$
      BEGIN
        IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
          BEGIN
            NEW.location := ST_SetSRID(
              ST_MakePoint(NEW.longitude, NEW.latitude),
              4326
            )::extensions.geography;
          EXCEPTION WHEN others THEN
            NULL;
          END;
        END IF;
        NEW.updated_at := now();
        RETURN NEW;
      END;
      $inner$
    $func$;

    EXECUTE '
      DROP TRIGGER IF EXISTS trg_business_locations_set_location
        ON public.business_locations;
      CREATE TRIGGER trg_business_locations_set_location
        BEFORE INSERT OR UPDATE ON public.business_locations
        FOR EACH ROW EXECUTE FUNCTION public.business_locations_set_location()
    ';
    RAISE NOTICE 'PostGIS auto-populate trigger created on business_locations.';
  ELSE
    RAISE NOTICE 'PostGIS column not present — trg_business_locations_set_location skipped.';
  END IF;
END $$;


-- =============================================================================
-- STEP 11 — VALIDATION QUERIES
-- Run these immediately after applying the migration to confirm success.
-- All queries are SELECT-only and make no changes to data.
-- Compare row counts in 11h against your pre-migration baseline.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 11a. All four tables exist with expected column counts
-- ---------------------------------------------------------------------------
SELECT
  t.table_name,
  COUNT(c.column_name) AS column_count
FROM information_schema.tables t
JOIN information_schema.columns c
  ON c.table_schema = t.table_schema
 AND c.table_name   = t.table_name
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'businesses',
    'business_members',
    'business_locations',
    'business_applications'
  )
GROUP BY t.table_name
ORDER BY t.table_name;
-- Expected: 4 rows.
--   business_applications  8+ columns
--   business_locations    14+ columns (15 if PostGIS location column added)
--   business_members      10+ columns
--   businesses            20+ columns

-- ---------------------------------------------------------------------------
-- 11b. Both new enums exist with correct values
-- ---------------------------------------------------------------------------
SELECT
  t.typname                                             AS enum_name,
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('business_member_role', 'partner_status')
GROUP BY t.typname
ORDER BY t.typname;
-- Expected 2 rows:
--   business_member_role | owner, admin, staff
--   partner_status       | pending, approved, suspended, rejected

-- ---------------------------------------------------------------------------
-- 11c. is_business_member() function created with SECURITY DEFINER
-- ---------------------------------------------------------------------------
SELECT
  routine_name,
  security_type,
  routine_definition IS NOT NULL AS has_body
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name   = 'is_business_member';
-- Expected: 1 row, security_type = 'DEFINER', has_body = true.

-- ---------------------------------------------------------------------------
-- 11d. RLS enabled on all four new tables
-- ---------------------------------------------------------------------------
SELECT
  relname        AS table_name,
  relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN (
    'businesses',
    'business_members',
    'business_locations',
    'business_applications'
  )
ORDER BY relname;
-- Expected: 4 rows, all rls_enabled = true.

-- ---------------------------------------------------------------------------
-- 11e. All 16 RLS policies created (4 per table)
-- ---------------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  cmd       AS operation
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'businesses',
    'business_members',
    'business_locations',
    'business_applications'
  )
ORDER BY tablename, cmd;
-- Expected: 16 rows (SELECT, INSERT, UPDATE, DELETE for each of 4 tables).

-- ---------------------------------------------------------------------------
-- 11f. All indexes created
-- ---------------------------------------------------------------------------
SELECT
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'businesses',
    'business_members',
    'business_locations',
    'business_applications'
  )
ORDER BY tablename, indexname;
-- Expected: at minimum 13 rows across all tables.
-- uq_business_members_business_user and uq_business_locations_one_primary
-- should both appear. PostGIS GIST index appears only if PostGIS is enabled.

-- ---------------------------------------------------------------------------
-- 11g. updated_at triggers created on three tables
-- ---------------------------------------------------------------------------
SELECT
  event_object_table AS table_name,
  trigger_name,
  action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN (
    'businesses',
    'business_locations',
    'business_applications'
  )
ORDER BY event_object_table, trigger_name;
-- Expected: 3 rows (one BEFORE UPDATE per table).
-- business_members has no updated_at column — no trigger expected.

-- ---------------------------------------------------------------------------
-- 11h. Existing data fully preserved (diff against pre-migration baseline)
-- ---------------------------------------------------------------------------
SELECT 'profiles'          AS table_name, COUNT(*) AS row_count FROM public.profiles
UNION ALL
SELECT 'partner_profiles',               COUNT(*) FROM public.partner_profiles
UNION ALL
SELECT 'partner_employees',              COUNT(*) FROM public.partner_employees
UNION ALL
SELECT 'partner_events',                 COUNT(*) FROM public.partner_events
UNION ALL
SELECT 'user_roles',                     COUNT(*) FROM public.user_roles
ORDER BY table_name;
-- Expected: identical counts to your pre-migration snapshot.
-- New tables will all show 0 rows (they are empty at this point).

-- ---------------------------------------------------------------------------
-- 11i. Partial unique index on business_members (excludes NULL user_ids)
-- ---------------------------------------------------------------------------
SELECT indexname, indexdef
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  tablename  = 'business_members'
  AND  indexname  = 'uq_business_members_business_user';
-- Expected: 1 row. indexdef should contain "WHERE (user_id IS NOT NULL)".

-- ---------------------------------------------------------------------------
-- 11j. Partial unique index on business_locations (one primary per business)
-- ---------------------------------------------------------------------------
SELECT indexname, indexdef
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  tablename  = 'business_locations'
  AND  indexname  = 'uq_business_locations_one_primary';
-- Expected: 1 row. indexdef should contain "WHERE (is_primary = true)".

-- =============================================================================
-- END OF PHASE 1 MIGRATION  (Rev 2)
-- =============================================================================
