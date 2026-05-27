-- =============================================================================
-- BogieBoard Phase 1 Migration
-- File : bogieboard_phase1_migration.sql
-- Date : 2026-05-26
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
-- Helper function created
-- -----------------------
--   public.is_business_member()   — SECURITY DEFINER, used by RLS policies
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
--     DO $$ EXCEPTION WHEN duplicate_object (for enums and types)
--     CREATE OR REPLACE FUNCTION
--     DROP POLICY IF EXISTS before CREATE POLICY (Phase 1 policies only)
--     DROP TRIGGER IF EXISTS before CREATE TRIGGER
-- =============================================================================


-- =============================================================================
-- SECTION 1 — ENUMS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1a. business_member_role
--
--     Defines the three access tiers within a business.
--       owner  — created the business; can transfer ownership and delete.
--       admin  — manages events, promotions, employees, and locations.
--       staff  — can verify consumer redemptions at point of sale.
--
--     The is_business_member() helper (Section 2b) enforces the hierarchy:
--       'staff' check passes for staff, admin, or owner.
--       'admin' check passes for admin or owner only.
--       'owner' check passes for owner only.
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.business_member_role AS ENUM ('owner', 'admin', 'staff');
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Type business_member_role already exists — skipping.';
END $$;

-- -----------------------------------------------------------------------------
-- 1b. partner_status
--
--     Lifecycle of a business account or application submission.
--       pending   — submitted, awaiting admin review (default).
--       approved  — account is live and visible to consumers.
--       suspended — temporarily blocked by an admin.
--       rejected  — review failed; business may reapply.
--
--     Used on both businesses.verification_status and
--     business_applications.status so the two tables share consistent
--     vocabulary without coupling their rows.
-- -----------------------------------------------------------------------------
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
-- SECTION 2 — HELPER FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2a. update_updated_at_column()
--
--     Already exists in the database (created in migration 20260213131016).
--     Included here as CREATE OR REPLACE so Phase 1 is self-contained and
--     the function body is pinned to a known state.
--     Existing triggers that reference this function are unaffected.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2b. is_business_member(_business_id, _min_role)
--
--     NEW function. Returns TRUE if the currently authenticated user belongs
--     to the given business with at least the requested role level.
--
--     SECURITY DEFINER: runs with the permissions of the function owner
--     (the database role that owns the schema) so RLS policies can call it
--     without recursive policy evaluation or permission escalation from the
--     calling user's session.
--
--     SET search_path = public: prevents search-path injection attacks.
--
--     STABLE: result for the same inputs does not change within a single
--     statement; the planner may cache it per-row.
--
--     Called from every business-scoped RLS policy in this migration instead
--     of writing raw EXISTS subqueries in each policy, keeping the security
--     logic in one auditable place.
-- -----------------------------------------------------------------------------
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
-- SECTION 3 — TABLES
-- Created in dependency order: businesses first (no external deps beyond
-- categories/subcategories which already exist), then business_members and
-- business_locations (both FK to businesses), then business_applications
-- (FK to businesses).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3a. businesses
--
--     The canonical business entity. Completely decoupled from any specific
--     auth user — the link to users lives in business_members (3b).
--     This decoupling allows:
--       • Multiple admin users per business.
--       • Transfer of business ownership without changing the entity row.
--       • Historical event/promotion records that survive owner changes.
--
--     Relationship to existing schema during Phase 1:
--       • partner_profiles continues to work exactly as before.
--       • New sign-ups via the redesigned partner flow write here.
--       • Backfill from partner_profiles → businesses happens in Phase 2.
-- -----------------------------------------------------------------------------
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
  -- verification_status uses partner_status enum; default 'pending'.
  -- verified_by / verified_at / review_notes record the admin decision audit trail.
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
  'URL-safe unique identifier, e.g. "joes-bar-and-grill-raleigh". '
  'Generated by the application layer at creation time.';

COMMENT ON COLUMN public.businesses.verification_status IS
  'pending → approved (or rejected) by admin. '
  'suspended = was approved but temporarily blocked by admin action.';

COMMENT ON COLUMN public.businesses.verified_by IS
  'auth.users.id of the admin who last changed verification_status.';

-- -----------------------------------------------------------------------------
-- 3b. business_members
--
--     Junction table connecting auth users to businesses with a role.
--     Replaces the implicit 1-to-1 constraint in partner_profiles.user_id UNIQUE.
--
--     Key design decisions:
--       • user_id is nullable: allows storing external contacts (e.g. a PR agency
--         contact) who do not have a BogieBoard account. These rows carry only the
--         contact_* text fields and have no platform access.
--       • UNIQUE (business_id, user_id): an auth user may appear once per business.
--         The constraint is a partial unique index below so NULL user_ids (external
--         contacts) are not constrained against each other.
--       • invited_by: audit trail for who added this member.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_members (
  id            UUID                        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Which business this membership belongs to
  business_id   UUID                        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- The BogieBoard user (NULL for external contacts without an account)
  user_id       UUID                        REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Role within this business
  role          public.business_member_role NOT NULL DEFAULT 'staff',

  -- Lightweight contact fields (used when user_id IS NULL, or as override display)
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
  'NULL = external contact (formerly stored as a partner_employees row). '
  'Non-null = authenticated BogieBoard user with platform access to this business.';

COMMENT ON COLUMN public.business_members.role IS
  'owner  : full control, can delete business and transfer ownership. '
  'admin  : can manage events, promotions, locations, and staff members. '
  'staff  : can verify consumer redemptions at point of sale.';

-- Unique constraint on (business_id, user_id) for real users only.
-- NULL user_ids (external contacts) are excluded so multiple external contacts
-- can exist per business without violating uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_members_business_user
  ON public.business_members(business_id, user_id)
  WHERE user_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3c. business_locations
--
--     One business can have multiple physical locations — a restaurant with two
--     branches, a multi-campus venue, a franchise. Each location has full
--     address fields and lat/lng for proximity search.
--
--     The PostGIS geography column is added via a conditional DO block so the
--     migration succeeds even in environments where the PostGIS extension has
--     not been initialised (e.g. local dev without postgis enabled). A warning
--     is raised rather than an error so the rest of the migration runs.
--
--     is_primary: exactly one row per business should have is_primary = TRUE.
--     Enforced by application logic in Phase 1; a partial unique index is
--     added below to enforce it at the database level.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_locations (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id   UUID        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- Human-readable label, e.g. "Downtown Branch" or "Main Office"
  name          TEXT        NOT NULL DEFAULT 'Primary Location',

  -- Only one row per business should be primary
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
  -- PostGIS geography column added below via ALTER TABLE (conditional)

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_locations IS
  'Physical locations for a business. Supports multi-location businesses. '
  'PostGIS geography column (location) added conditionally below. '
  'Phase 2: promotions and partner_events gain a location_id FK to this table.';

COMMENT ON COLUMN public.business_locations.is_primary IS
  'Exactly one row per business should be TRUE. '
  'Enforced by the partial unique index uq_business_locations_one_primary.';

-- Enforce one primary location per business at the database level
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_locations_one_primary
  ON public.business_locations(business_id)
  WHERE is_primary = true;

-- Conditionally add the PostGIS geography column.
-- Mirrors the pattern used in the venues table (migration 20260213191409).
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
    'Proximity search will not be available until PostGIS is enabled.',
    SQLERRM;
END $$;

-- -----------------------------------------------------------------------------
-- 3d. business_applications
--
--     The admin review queue for new partner account submissions.
--     Deliberately separate from the businesses table so that:
--       • A business entity exists and can be referenced by the applicant
--         even before approval.
--       • A rejected business can reapply (new row) without mutating the
--         core businesses record.
--       • The review audit trail (reviewer_id, reviewed_at, review_notes)
--         does not clutter the businesses table.
--
--     Flow: applicant creates a business → application is auto-created with
--     status='pending' → admin sets status='approved' or 'rejected' on this
--     table → business.verification_status is updated to match by the
--     handle_application_decision trigger (Phase 3).
--
--     Phase 1: the trigger is not yet created; admin updates both rows manually
--     or via a simple Supabase RPC until Phase 3.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_applications (
  id            UUID                  NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Which business this application is for
  business_id   UUID                  NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,

  -- Who submitted the application (must be an owner/admin of the business)
  submitted_by  UUID                  NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Review state
  status        public.partner_status NOT NULL DEFAULT 'pending',

  -- Admin review fields (null until reviewed)
  reviewer_id   UUID                  REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  review_notes  TEXT,

  -- When was this application submitted
  submitted_at  TIMESTAMPTZ           NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ           NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.business_applications IS
  'Admin review queue for partner onboarding. '
  'One row per submission attempt — rejected applicants create a new row to reapply. '
  'Phase 3 will add a trigger that syncs approval decision to businesses.verification_status.';

COMMENT ON COLUMN public.business_applications.status IS
  'Mirrors partner_status enum. Admin sets this; '
  'Phase 3 trigger propagates the decision to businesses.verification_status.';


-- =============================================================================
-- SECTION 4 — INDEXES
-- All use CREATE INDEX IF NOT EXISTS.
-- Naming convention: idx_{table}_{column(s)}
-- All foreign key columns get an index — Postgres does not auto-index FKs.
-- =============================================================================

-- businesses
CREATE INDEX IF NOT EXISTS idx_businesses_verification_status
  ON public.businesses(verification_status);

CREATE INDEX IF NOT EXISTS idx_businesses_category_id
  ON public.businesses(category_id);

CREATE INDEX IF NOT EXISTS idx_businesses_created_at
  ON public.businesses(created_at DESC);

-- business_members
-- Note: the UNIQUE partial index (uq_business_members_business_user) above
-- already covers (business_id, user_id) lookups. Add individual-column
-- indexes for queries that filter on one side only.
CREATE INDEX IF NOT EXISTS idx_business_members_business_id
  ON public.business_members(business_id);

CREATE INDEX IF NOT EXISTS idx_business_members_user_id
  ON public.business_members(user_id)
  WHERE user_id IS NOT NULL;

-- Composite: "which businesses does this user have at least admin access to?"
-- Used by the PartnerDashboard query and by is_business_member() cache warming.
CREATE INDEX IF NOT EXISTS idx_business_members_user_role
  ON public.business_members(user_id, role)
  WHERE user_id IS NOT NULL;

-- business_locations
CREATE INDEX IF NOT EXISTS idx_business_locations_business_id
  ON public.business_locations(business_id);

CREATE INDEX IF NOT EXISTS idx_business_locations_city
  ON public.business_locations(city);

-- Conditionally create the PostGIS GIST spatial index
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
-- SECTION 5 — ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all four new tables.
-- (Calling ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent —
--  safe to run even if RLS was already enabled.)
ALTER TABLE public.businesses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_locations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_applications ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 5a. businesses policies
--
--     SELECT: approved businesses are visible to everyone (consumers browsing
--             the directory). Pending/suspended/rejected businesses are only
--             visible to their own members and to platform admins.
--             This prevents a rejected business from appearing in search results
--             while their account is under review.
--
--     INSERT: any authenticated user can create a business entity.
--             The business_members owner row is created immediately after by
--             application code (or in Phase 3 by a trigger).
--             There is intentionally no role pre-requisite here — a general user
--             signs up and creates both the business row and their member row
--             as part of the same partner onboarding flow.
--
--     UPDATE: members with at least the 'admin' role within that business,
--             or platform admins. Staff-level members cannot edit the business
--             profile itself (only admins/owners can).
--
--     DELETE: platform admins only. Businesses have historical event records,
--             partner contacts, and financial relationships that should never
--             be silently deleted by an owner.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 5b. business_members policies
--
--     SELECT: any member of the business (any role) can see who else is in
--             the business. Platform admins see all rows.
--
--     INSERT: existing admins/owners can add new members to their business.
--             The very first owner row is inserted by application code
--             immediately after the business is created (before RLS applies
--             because it runs in the same authenticated session that just
--             inserted the business row, satisfying the admin check via
--             is_business_member which will return true for an owner).
--             NOTE: the first owner row is a bootstrapping edge case.
--             Phase 3 will add a SECURITY DEFINER trigger to handle it.
--             For Phase 1, application code inserts both the business row
--             and the first owner member row in a single transaction.
--
--     UPDATE: business admins/owners and platform admins.
--
--     DELETE: business admins/owners and platform admins. A guard trigger
--             (Phase 3) will prevent deletion of the last owner row.
-- -----------------------------------------------------------------------------
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
    -- Existing admin/owner of this business can add members
    public.is_business_member(business_id, 'admin')
    -- Platform admin can add members to any business
    OR public.has_role(auth.uid(), 'admin')
    -- Self-insert of own owner row during initial business creation
    -- (user_id must match the authenticated user; role must be owner)
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

-- -----------------------------------------------------------------------------
-- 5c. business_locations policies
--
--     SELECT: public — location data is not sensitive and consumers need it
--             to find physical venues.
--
--     INSERT/UPDATE/DELETE: business admins/owners and platform admins.
--             Staff-level members cannot add or edit locations.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 5d. business_applications policies
--
--     SELECT: the submitter sees their own applications; platform admins see all.
--             Business members who did not submit cannot see the application —
--             this avoids exposing review_notes to staff.
--
--     INSERT: the submitter must be an owner or admin of the referenced business
--             (prevents spurious applications against other people's businesses).
--
--     UPDATE: platform admins only — they are the only ones who set reviewer_id,
--             reviewed_at, review_notes, and the final status.
--
--     DELETE: platform admins only.
-- -----------------------------------------------------------------------------
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
-- SECTION 6 — TRIGGERS
-- Only the updated_at maintenance triggers are created in Phase 1.
-- Business logic triggers (owner-row auto-creation, last-owner guard,
-- application decision propagation) are deferred to Phase 3.
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

-- Conditionally create the PostGIS auto-populate trigger on business_locations
-- (mirrors trg_venues_set_location from migration 20260213191409)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
    AND    table_name   = 'business_locations'
    AND    column_name  = 'location'
  ) THEN
    -- Create the function (safe to replace)
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
            NULL; -- PostGIS not available; skip silently
          END;
        END IF;
        NEW.updated_at := now();
        RETURN NEW;
      END;
      $inner$
    $func$;

    -- Drop and re-create trigger (idempotent)
    EXECUTE '
      DROP TRIGGER IF EXISTS trg_business_locations_set_location
        ON public.business_locations;
      CREATE TRIGGER trg_business_locations_set_location
        BEFORE INSERT OR UPDATE ON public.business_locations
        FOR EACH ROW EXECUTE FUNCTION public.business_locations_set_location()
    ';
    RAISE NOTICE 'PostGIS auto-populate trigger created on business_locations.';
  ELSE
    RAISE NOTICE
      'PostGIS column not present — skipping trg_business_locations_set_location.';
  END IF;
END $$;


-- =============================================================================
-- SECTION 7 — VALIDATION QUERIES
-- Run these immediately after applying the migration to confirm success.
-- All queries are SELECT-only and make no changes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 7a. Confirm all four tables were created
-- ---------------------------------------------------------------------------
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c
   WHERE c.table_schema = t.table_schema
   AND   c.table_name   = t.table_name)          AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND   table_name IN (
  'businesses',
  'business_members',
  'business_locations',
  'business_applications'
)
ORDER BY table_name;
-- Expected: 4 rows, each with column_count > 0.

-- ---------------------------------------------------------------------------
-- 7b. Confirm both new enums exist and have the correct values
-- ---------------------------------------------------------------------------
SELECT
  t.typname                         AS enum_name,
  string_agg(e.enumlabel, ', '
    ORDER BY e.enumsortorder)       AS values
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('business_member_role', 'partner_status')
GROUP BY t.typname
ORDER BY t.typname;
-- Expected:
--   business_member_role | admin, owner, staff
--   partner_status       | approved, pending, rejected, suspended

-- ---------------------------------------------------------------------------
-- 7c. Confirm is_business_member() function was created
-- ---------------------------------------------------------------------------
SELECT
  routine_name,
  security_type,
  routine_definition IS NOT NULL AS has_body
FROM information_schema.routines
WHERE routine_schema = 'public'
AND   routine_name   = 'is_business_member';
-- Expected: 1 row, security_type = 'DEFINER', has_body = true.

-- ---------------------------------------------------------------------------
-- 7d. Confirm RLS is enabled on all four tables
-- ---------------------------------------------------------------------------
SELECT
  relname       AS table_name,
  relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
AND   relname IN (
  'businesses',
  'business_members',
  'business_locations',
  'business_applications'
)
ORDER BY relname;
-- Expected: 4 rows, all with rls_enabled = true.

-- ---------------------------------------------------------------------------
-- 7e. Confirm RLS policies were created (16 total across 4 tables)
-- ---------------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  cmd        AS operation,
  permissive
FROM pg_policies
WHERE schemaname = 'public'
AND   tablename IN (
  'businesses',
  'business_members',
  'business_locations',
  'business_applications'
)
ORDER BY tablename, cmd;
-- Expected: 16 rows (4 per table: SELECT, INSERT, UPDATE, DELETE).

-- ---------------------------------------------------------------------------
-- 7f. Confirm indexes were created
-- ---------------------------------------------------------------------------
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND   tablename IN (
  'businesses',
  'business_members',
  'business_locations',
  'business_applications'
)
ORDER BY tablename, indexname;
-- Expected: at minimum 12 rows (3-4 per table).
-- The PostGIS GIST index will appear only if PostGIS is enabled.

-- ---------------------------------------------------------------------------
-- 7g. Confirm updated_at triggers were created
-- ---------------------------------------------------------------------------
SELECT
  event_object_table  AS table_name,
  trigger_name,
  event_manipulation  AS fires_on,
  action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND   event_object_table IN (
  'businesses',
  'business_locations',
  'business_applications'
)
ORDER BY event_object_table, trigger_name;
-- Expected: 3 rows (one BEFORE UPDATE per table).
-- business_members intentionally has no updated_at column or trigger.

-- ---------------------------------------------------------------------------
-- 7h. Confirm existing data is completely intact
-- ---------------------------------------------------------------------------
SELECT
  'profiles'         AS table_name, COUNT(*) AS row_count FROM public.profiles
UNION ALL SELECT
  'partner_profiles',               COUNT(*) FROM public.partner_profiles
UNION ALL SELECT
  'partner_employees',              COUNT(*) FROM public.partner_employees
UNION ALL SELECT
  'partner_events',                 COUNT(*) FROM public.partner_events
UNION ALL SELECT
  'user_roles',                     COUNT(*) FROM public.user_roles
ORDER BY table_name;
-- Expected: row counts identical to pre-migration counts.
-- Run this BEFORE and AFTER applying the migration and diff the results.

-- ---------------------------------------------------------------------------
-- 7i. Confirm the unique partial index on business_members was created
-- ---------------------------------------------------------------------------
SELECT indexname, indexdef
FROM   pg_indexes
WHERE  schemaname = 'public'
AND    tablename  = 'business_members'
AND    indexname  = 'uq_business_members_business_user';
-- Expected: 1 row showing a partial unique index WHERE user_id IS NOT NULL.

-- ---------------------------------------------------------------------------
-- 7j. Confirm the unique partial index on business_locations was created
-- ---------------------------------------------------------------------------
SELECT indexname, indexdef
FROM   pg_indexes
WHERE  schemaname = 'public'
AND    tablename  = 'business_locations'
AND    indexname  = 'uq_business_locations_one_primary';
-- Expected: 1 row showing a partial unique index WHERE is_primary = true.

-- =============================================================================
-- END OF PHASE 1 MIGRATION
-- =============================================================================
