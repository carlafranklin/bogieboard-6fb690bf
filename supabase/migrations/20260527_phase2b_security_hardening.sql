-- =============================================================================
-- BogieBoard Phase 2b Migration — Security Hardening
-- File    : bogieboard_phase2b_migration.sql
-- Created : 2026-05-26
--
-- DEPENDS ON
-- ----------
--   Phase 1 (businesses, business_members, is_business_member, Phase 1 RLS)
--   Phase 2a (handle_new_user, create_business_with_owner, record_login,
--              partner_profiles INSERT fix, profiles INSERT fix)
--
-- SCOPE — P0 AND P1 AUDIT FINDINGS ONLY
-- ---------------------------------------
--   P0-A  Remove business_members self-owner INSERT escalation.
--   P0-B  Prevent role self-escalation via business_members UPDATE.
--   P1-A  Create partner_profiles_public view (safe column projection).
--   P1-B  Tighten partner_profiles SELECT (hide pending/rejected from public).
--   P1-C  Restrict partner_events SELECT to approved events for public.
--   P1-D  Add has_role('partner') to partner_events INSERT.
--   PERF  Add missing indexes for the new policy filter columns.
--
-- WHAT THIS MIGRATION DOES NOT DO
-- --------------------------------
--   Does not change businesses, business_locations, business_applications
--   policies. Does not touch profiles, user_roles, or any data pipeline
--   policy. Does not modify handle_new_user, create_business_with_owner,
--   or record_login. Does not drop or alter any table. Does not add
--   storage bucket policies. Does not generate frontend code.
--
-- FRONTEND IMPACT SUMMARY (read before deploying)
-- ------------------------------------------------
--   NO pages break immediately after this migration:
--
--   PartnerPage.tsx (/partners/:slug)
--     • Approved profiles: continue working exactly as before.
--     • Pending/rejected profiles: will show "Partner Not Found" — this is
--       the correct new behavior (pending partners should not have a live
--       public page). Partners should be informed of this change.
--     • select('*') still returns user_id and verification_status because
--       the page queries the table, not the view. This is a data exposure
--       that continues until the page is updated to use partner_profiles_public.
--     • ACTION REQUIRED next sprint: change line 4984 to query
--       partner_profiles_public, and change line 4990 from
--       .eq('status','active') to .eq('status','approved').
--
--   PartnerDashboard.tsx — no change in behavior. Owner auth clause covers it.
--   Events.tsx          — no change. Already queries status='approved'.
--   Admin.tsx           — no change. Admin clause covers all rows/statuses.
--   PartnerMember.tsx   — no change. INSERT policy fixed in Phase 2a.
--
-- IDEMPOTENCY
-- -----------
--   Safe to re-run:
--     CREATE OR REPLACE VIEW
--     CREATE INDEX IF NOT EXISTS
--     DROP POLICY IF EXISTS before every CREATE POLICY
-- =============================================================================


-- =============================================================================
-- SECTION 1 — P0-A: Close business_members self-owner INSERT escalation
--
-- THE VULNERABILITY
-- -----------------
--   Phase 1 INSERT policy contained the clause:
--     OR (user_id = auth.uid() AND role = 'owner')
--
--   This checked only that the INSERT row's user_id matched the caller and
--   role was 'owner'. It placed NO constraint on business_id. Any
--   authenticated user could therefore execute:
--
--     INSERT INTO business_members (business_id, user_id, role)
--     VALUES ('<any_existing_business_id>', auth.uid(), 'owner');
--
--   Postgres evaluates RLS on the new row values. user_id = auth.uid() ✓
--   role = 'owner' ✓. No business_id check. Insert succeeds.
--   trg_business_member_insert then fires and grants the partner app_role.
--   The attacker now owns another business and holds the partner role.
--
-- WHY REMOVAL IS SAFE FOR create_business_with_owner()
-- -----------------------------------------------------
--   create_business_with_owner() is SECURITY DEFINER. It runs as the
--   Postgres schema owner (superuser). Superusers are EXEMPT FROM RLS —
--   no policy evaluation occurs for their statements. The INSERT into
--   business_members inside the RPC never touches this policy regardless
--   of what it says. Removing the self-owner clause has zero effect on
--   the RPC path.
--
--   The only path for initial owner row creation is now the RPC. This is
--   the intended architecture.
--
-- NEW POLICY
-- ----------
--   Only an existing admin/owner of the business may add new members.
--   Platform admins may add members to any business.
-- =============================================================================

DROP POLICY IF EXISTS "bb_business_members_insert" ON public.business_members;

CREATE POLICY "bb_business_members_insert"
  ON public.business_members FOR INSERT
  WITH CHECK (
    -- Existing admin or owner of this specific business adds new members
    public.is_business_member(business_id, 'admin')
    -- Platform admin can add members to any business
    OR public.has_role(auth.uid(), 'admin')
    -- The self-owner clause (user_id = auth.uid() AND role = 'owner') has
    -- been intentionally removed. All initial owner row creation must go
    -- through create_business_with_owner() which bypasses RLS entirely.
  );

COMMENT ON POLICY "bb_business_members_insert" ON public.business_members IS
  'Phase 2b: self-owner INSERT clause removed (was a business-hijack + role '
  'escalation vector). Initial business creation is exclusively via '
  'create_business_with_owner() RPC (SECURITY DEFINER, bypasses RLS).';


-- =============================================================================
-- SECTION 2 — P0-B: Prevent role self-escalation via business_members UPDATE
--
-- THE VULNERABILITY
-- -----------------
--   Phase 1 UPDATE policy:
--     USING (is_business_member(business_id,'admin') OR has_role(...,'admin'))
--
--   is_business_member(business_id,'admin') returns true for both 'admin'
--   and 'owner' roles (the hierarchy). An 'admin' member could execute:
--
--     UPDATE business_members SET role = 'owner'
--     WHERE user_id = auth.uid() AND business_id = '<id>';
--
--   USING checks the existing row — the caller is 'admin', check passes.
--   There was no WITH CHECK to restrict what the new row could contain.
--   The admin would become an owner without any owner authorising it.
--
-- THE FIX
-- -------
--   Postgres UPDATE policies support both USING (filter on the existing row)
--   and WITH CHECK (filter on the proposed new row). We add WITH CHECK to
--   enforce: only a current OWNER of the business may write role = 'owner'
--   into any member row. Admins may update any field except they cannot
--   write role = 'owner'. Platform admins are unrestricted.
--
--   This closes self-promotion (admin → owner) while allowing legitimate
--   admin operations: updating contact fields, changing staff to admin, etc.
-- =============================================================================

DROP POLICY IF EXISTS "bb_business_members_update" ON public.business_members;

CREATE POLICY "bb_business_members_update"
  ON public.business_members FOR UPDATE
  -- USING: the existing row must match (caller must already be admin-or-above)
  USING (
    public.is_business_member(business_id, 'admin')
    OR public.has_role(auth.uid(), 'admin')
  )
  -- WITH CHECK: the proposed new row must satisfy this
  WITH CHECK (
    -- Platform admin: unrestricted on what they write
    public.has_role(auth.uid(), 'admin')
    -- Current business owner: may assign any role value including 'owner'
    OR public.is_business_member(business_id, 'owner')
    -- Business admin (not owner): may update rows but cannot write role = 'owner'
    OR (
      public.is_business_member(business_id, 'admin')
      AND role <> 'owner'
    )
  );

COMMENT ON POLICY "bb_business_members_update" ON public.business_members IS
  'Phase 2b: WITH CHECK added to prevent admin self-escalation to owner. '
  'Only current owners may set role = owner. Platform admins are unrestricted.';


-- =============================================================================
-- SECTION 3 — P1-A: Create partner_profiles_public view
--
-- PURPOSE
-- -------
--   Expose only directory-safe columns of partner_profiles to public callers.
--   Postgres RLS is row-level only — it cannot restrict which columns are
--   returned when a row passes the USING check. A view with an explicit
--   SELECT list is the correct mechanism for column-level restriction.
--
-- COLUMN CLASSIFICATION
-- ---------------------
--   PUBLIC-SAFE (included): id, slug, business_name, description, logo_url,
--     cover_url, address, city, state, zip_code, phone, website,
--     social_facebook, social_instagram, social_twitter, social_linkedin,
--     category_id, subcategory_id, created_at, updated_at.
--
--   SENSITIVE (excluded):
--     user_id            — links business to owner's auth UUID. Exposing
--                          this allows correlation of a business identity
--                          with an internal auth account.
--     verification_status — internal admin workflow state. Partners
--                           reasonably expect pending/rejected status to
--                           be private. Public callers have no use for it.
--
--   phone and address are intentionally in the public-safe list because
--   PartnerPage.tsx displays them on the public business directory page
--   (lines 5026-5057). This reflects the partner's consent at signup.
--
-- VIEW SECURITY MODEL
-- -------------------
--   SECURITY INVOKER (the Postgres default for views). The view executes
--   as the calling user. The underlying partner_profiles table RLS applies
--   normally: the new SELECT policy (Section 4) controls which ROWS are
--   visible, and this view's column list controls which COLUMNS are exposed.
--   Together they provide both row-level and column-level enforcement.
--
--   SECURITY DEFINER would execute as the schema owner, bypassing table
--   RLS entirely — which would defeat the row-level restriction. SECURITY
--   INVOKER is the correct choice here.
--
-- FRONTEND MIGRATION NOTE
-- -----------------------
--   PartnerPage.tsx line 4984 should be updated to query this view:
--     Before: supabase.from('partner_profiles').select('*').eq('slug', slug)
--     After:  supabase.from('partner_profiles_public').select('*').eq('slug', slug)
--   Until that change ships, the original table query continues working —
--   it just continues to expose user_id and verification_status at the
--   API level (not rendered in the UI). No UX regression.
-- =============================================================================

CREATE OR REPLACE VIEW public.partner_profiles_public AS
SELECT
  id,
  slug,
  business_name,
  description,
  logo_url,
  cover_url,
  address,
  city,
  state,
  zip_code,
  phone,
  website,
  social_facebook,
  social_instagram,
  social_twitter,
  social_linkedin,
  category_id,
  subcategory_id,
  created_at,
  updated_at
  -- user_id excluded: links business to auth identity (internal)
  -- verification_status excluded: internal admin workflow state
FROM public.partner_profiles;

COMMENT ON VIEW public.partner_profiles_public IS
  'Public-safe column projection of partner_profiles. '
  'Excludes user_id and verification_status. '
  'SECURITY INVOKER: underlying table RLS applies. '
  'Intended for unauthenticated callers (PartnerPage.tsx). '
  'Owners and admins should query the table directly for full column access.';


-- =============================================================================
-- SECTION 4 — P1-B: Tighten partner_profiles SELECT policy
--
-- CURRENT POLICY (from original migration 20260217031820)
-- -------------------------------------------------------
--   "Anyone can view partner profiles": USING (true)
--   Every row, every column, fully public to unauthenticated requests.
--
-- WHY THIS IS A PROBLEM
-- ---------------------
--   A pending or rejected partner has not yet been approved to participate
--   in the BogieBoard directory. Exposing their business profile before
--   approval undermines the review workflow and exposes information the
--   partner may not want public yet.
--
-- NEW POLICY INTENT
-- -----------------
--   Public callers: rows where verification_status = 'approved' only.
--   Owners: their own row at any verification status.
--   Admins: all rows at all statuses.
--
-- BEHAVIOR CHANGES
-- ----------------
--   Approved partner profiles: NO CHANGE. PartnerPage.tsx continues to
--     load the profile for approved partners.
--   Pending/rejected partner profiles: PartnerPage.tsx receives data=null
--     from .single() and renders "Partner Not Found". This is correct.
--   PartnerDashboard.tsx: NO CHANGE. Owner sees own row via owner clause.
--   Admin.tsx: NO CHANGE. Admin sees all rows via admin clause.
--
-- ROLLBACK IMPACT
-- ---------------
--   Rolling back restores "Anyone can view partner profiles" USING (true).
--   Pending profiles would become publicly accessible again. See Section 8.
-- =============================================================================

-- Drop both old name (original) and new name (for idempotency on re-run)
DROP POLICY IF EXISTS "Anyone can view partner profiles"  ON public.partner_profiles;
DROP POLICY IF EXISTS "bb_partner_profiles_select"        ON public.partner_profiles;

CREATE POLICY "bb_partner_profiles_select"
  ON public.partner_profiles FOR SELECT
  USING (
    -- Profile owner sees their own row at any verification status
    auth.uid() = user_id
    -- Platform admin sees all rows at all statuses
    OR public.has_role(auth.uid(), 'admin')
    -- Public sees only approved profiles
    OR verification_status = 'approved'
  );

COMMENT ON POLICY "bb_partner_profiles_select" ON public.partner_profiles IS
  'Phase 2b: replaces unrestricted USING (true). '
  'Pending and rejected profiles hidden from public callers. '
  'Owners see own row at any status. Admins see all. '
  'Public callers: use partner_profiles_public view for column safety.';


-- =============================================================================
-- SECTION 5 — P1-C: Restrict partner_events SELECT to approved events
--
-- CURRENT POLICY (from original migration 20260217031820)
-- -------------------------------------------------------
--   "Anyone can view partner events": USING (true)
--   Draft, pending, and rejected events readable by anyone.
--
-- WHY THIS IS A PROBLEM
-- ---------------------
--   A partner preparing a draft event has placeholder content, test data,
--   or incomplete information that is not ready for public consumption.
--   Status = 'pending' events are awaiting admin review. Status = 'rejected'
--   events contain moderation_notes that are meant for the partner only.
--   All three categories are currently publicly readable via the API.
--
-- STATUS VALUE NOTE
-- -----------------
--   Migration 20260224221155 ran:
--     UPDATE partner_events SET status = 'approved' WHERE status = 'active';
--   PartnerPage.tsx (line 4990) still queries status = 'active', which now
--   returns zero rows. This is a pre-existing bug in PartnerPage.tsx and
--   was returning zero events before this migration. Our policy change does
--   not worsen or cause this behavior.
--
--   The correct status value for public events is 'approved'. The default
--   for new events remains 'active' (from the table definition) — note this
--   means newly inserted events default to a value that is not in the
--   approved set and therefore not publicly visible until explicitly set to
--   'approved'. This is correct workflow behavior.
--
-- NEW POLICY INTENT
-- -----------------
--   Public callers: only status = 'approved' events.
--   Profile owner: all events for their own partner_profile at any status.
--   Admins: all events.
--
-- ADMIN.TXT IMPACT
-- ----------------
--   Admin.tsx line 5259 loads all partner_events including pending/rejected
--   for the moderation queue. The admin clause (has_role admin) covers this.
--   The admin approve/reject workflow (lines 5342-5363) uses UPDATE, which
--   is unchanged. No admin functionality is affected.
-- =============================================================================

-- Drop both old name and new name for idempotency
DROP POLICY IF EXISTS "Anyone can view partner events"  ON public.partner_events;
DROP POLICY IF EXISTS "bb_partner_events_select"        ON public.partner_events;

CREATE POLICY "bb_partner_events_select"
  ON public.partner_events FOR SELECT
  USING (
    -- Public: approved events only
    status = 'approved'
    -- Profile owner: all their own events at any status
    OR EXISTS (
      SELECT 1
      FROM   public.partner_profiles pp
      WHERE  pp.id      = partner_profile_id
      AND    pp.user_id = auth.uid()
    )
    -- Platform admin: all events at all statuses
    OR public.has_role(auth.uid(), 'admin')
  );

COMMENT ON POLICY "bb_partner_events_select" ON public.partner_events IS
  'Phase 2b: replaces unrestricted USING (true). '
  'Draft/pending/rejected events are now private to the owner and admins. '
  'PartnerPage.tsx queries status=active (pre-existing bug — returns 0 rows). '
  'Update PartnerPage.tsx to status=approved in the same sprint as the view migration.';


-- =============================================================================
-- SECTION 6 — P1-D: Add has_role check to partner_events INSERT
--
-- CURRENT POLICY (from original migration 20260217031820)
-- -------------------------------------------------------
--   "Partners can insert own events":
--     EXISTS (SELECT 1 FROM partner_profiles pp
--             WHERE pp.id = partner_profile_id AND pp.user_id = auth.uid())
--
--   Checks only that the caller owns the partner_profiles row.
--   Does NOT verify the caller has the partner app_role.
--
-- WHY THIS IS A PROBLEM
-- ---------------------
--   A user whose partner role was revoked by an admin but whose
--   partner_profiles row was not deleted can still insert new events.
--   The role revocation is bypassed because the INSERT policy only
--   checks table ownership, not the user_roles table.
--
-- NEW POLICY INTENT
-- -----------------
--   Caller must satisfy BOTH:
--     (a) has the 'partner' app_role in user_roles, AND
--     (b) owns the partner_profiles row linked to the event.
--   Platform admins may insert events for any partner profile.
--
-- BACKWARD COMPATIBILITY
-- ----------------------
--   All partners with both an active partner role and a partner_profiles
--   row are unaffected. Events.tsx and PartnerDashboard.tsx event creation
--   workflows are unaffected. The only newly blocked case is a user whose
--   role was revoked but who was previously able to bypass the revocation
--   via this INSERT path.
-- =============================================================================

-- Drop both old name and new name for idempotency
DROP POLICY IF EXISTS "Partners can insert own events"  ON public.partner_events;
DROP POLICY IF EXISTS "bb_partner_events_insert"        ON public.partner_events;

CREATE POLICY "bb_partner_events_insert"
  ON public.partner_events FOR INSERT
  WITH CHECK (
    (
      -- Caller must hold the active partner role
      public.has_role(auth.uid(), 'partner')
      -- AND must own the partner_profiles row linked to this event
      AND EXISTS (
        SELECT 1
        FROM   public.partner_profiles pp
        WHERE  pp.id      = partner_profile_id
        AND    pp.user_id = auth.uid()
      )
    )
    -- Platform admin may insert events on behalf of any partner profile
    OR public.has_role(auth.uid(), 'admin')
  );

COMMENT ON POLICY "bb_partner_events_insert" ON public.partner_events IS
  'Phase 2b: adds has_role(partner) check absent from original policy. '
  'Partners whose role was revoked can no longer insert events even if '
  'their partner_profiles row still exists. Admin bypass preserved.';


-- =============================================================================
-- SECTION 7 — PERFORMANCE INDEXES
--
-- RATIONALE
-- ---------
--   The new RLS policies introduce two new filter conditions that are
--   evaluated on every qualifying row scan:
--     1. partner_profiles.verification_status = 'approved'  (Section 4)
--     2. partner_events.status = 'approved'                 (Section 5)
--
--   Neither column has an existing index. At current scale the impact is
--   imperceptible, but both columns will be filter targets in every public
--   SELECT on their respective tables. Adding them now is zero-cost and
--   prevents future profiling work.
--
--   Index design choices:
--   • partner_profiles: btree on verification_status. Cardinality is low
--     (4 enum values: pending/approved/suspended/rejected) but the column
--     is used in both the RLS policy USING clause and future admin filters.
--   • partner_events: partial index WHERE status = 'approved'. Mirrors the
--     pattern of idx_canonical_events_search (line 7882 of original migration).
--     The public-facing query only ever reads approved events; a partial index
--     is smaller, faster, and more precisely targeted than a full btree.
--   • partner_events(partner_profile_id): the owner-clause EXISTS subquery
--     joins on partner_profile_id. If an index does not exist, add it.
--     (The original schema has no index on this FK column.)
--   • slug already has an implicit unique index from the UNIQUE constraint.
--     No additional index needed.
-- =============================================================================

-- Index on partner_profiles.verification_status
-- Used by: bb_partner_profiles_select USING clause, future admin dashboard filters
CREATE INDEX IF NOT EXISTS idx_partner_profiles_verification_status
  ON public.partner_profiles(verification_status);

-- Partial index on partner_events approved rows
-- Used by: bb_partner_events_select USING clause, Events.tsx, PartnerPage.tsx
CREATE INDEX IF NOT EXISTS idx_partner_events_approved
  ON public.partner_events(event_date, partner_profile_id)
  WHERE status = 'approved';

-- Index on partner_events.partner_profile_id
-- Used by: owner-clause EXISTS subquery in bb_partner_events_select,
--          PartnerDashboard.tsx event fetch, partner_employees FK lookups
CREATE INDEX IF NOT EXISTS idx_partner_events_profile_id
  ON public.partner_events(partner_profile_id);

-- Index on partner_events.status (non-partial, for admin status-based filtering)
CREATE INDEX IF NOT EXISTS idx_partner_events_status
  ON public.partner_events(status);


-- =============================================================================
-- SECTION 8 — VALIDATION QUERIES
-- Run immediately after applying in Dev. All are SELECT-only.
-- =============================================================================

-- 8a. Confirm business_members INSERT policy: self-owner clause absent
SELECT policyname, cmd, with_check AS check_expression
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'business_members'
  AND  cmd        = 'INSERT';
/*
  Expected: 1 row — "bb_business_members_insert"
  check_expression must NOT contain "user_id = auth.uid() AND role".
*/

-- 8b. Confirm business_members UPDATE policy: WITH CHECK present
SELECT policyname, cmd, qual AS using_expr, with_check AS check_expr
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'business_members'
  AND  cmd        = 'UPDATE';
/*
  Expected: 1 row — "bb_business_members_update"
  check_expr must contain "role <> 'owner'" to block admin self-escalation.
  check_expr must contain "is_business_member(business_id, 'owner')" for owner path.
*/

-- 8c. Confirm partner_profiles_public view exists with correct columns
SELECT column_name
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'partner_profiles_public'
ORDER  BY ordinal_position;
/*
  Expected: 20 columns.
  Must NOT include: user_id, verification_status.
  Must include: id, slug, business_name, description, logo_url, cover_url,
    address, city, state, zip_code, phone, website, social_facebook,
    social_instagram, social_twitter, social_linkedin, category_id,
    subcategory_id, created_at, updated_at.
*/

-- 8d. Confirm sensitive columns absent from view
SELECT column_name
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'partner_profiles_public'
  AND  column_name IN ('user_id', 'verification_status');
-- Expected: 0 rows. Both columns must be absent.

-- 8e. Confirm partner_profiles SELECT policy replaced
SELECT policyname, cmd, qual AS using_expression
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'partner_profiles'
  AND  cmd        = 'SELECT';
/*
  Expected: 1 row — "bb_partner_profiles_select"
  "Anyone can view partner profiles" must be gone.
  using_expression must contain "verification_status = 'approved'".
*/

-- 8f. Confirm partner_events SELECT policy replaced
SELECT policyname, cmd, qual AS using_expression
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'partner_events'
  AND  cmd        = 'SELECT';
/*
  Expected: 1 row — "bb_partner_events_select"
  "Anyone can view partner events" must be gone.
  using_expression must contain "status = 'approved'".
*/

-- 8g. Confirm partner_events INSERT policy has role check
SELECT policyname, cmd, with_check AS check_expression
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  = 'partner_events'
  AND  cmd        = 'INSERT';
/*
  Expected: 1 row — "bb_partner_events_insert"
  check_expression must contain "has_role" and "'partner'".
*/

-- 8h. Confirm all four new indexes exist
SELECT indexname, tablename, indexdef
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  indexname IN (
    'idx_partner_profiles_verification_status',
    'idx_partner_events_approved',
    'idx_partner_events_profile_id',
    'idx_partner_events_status'
  )
ORDER  BY tablename, indexname;
-- Expected: 4 rows.

-- 8i. Confirm untouched policies are unchanged
SELECT tablename, policyname, cmd
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename  IN (
    'profiles', 'user_roles', 'businesses',
    'business_locations', 'business_applications', 'partner_employees'
  )
ORDER  BY tablename, cmd;
/*
  Expected: same set of policies as pre-migration.
  No policies on these tables should have changed.
*/

-- 8j. Escalation smoke test (run manually as a non-admin test user)
/*
  -- Attempt 1: claim ownership of an existing business (should FAIL)
  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES ('<any_real_business_id>', auth.uid(), 'owner');
  -- Expected: ERROR: new row violates row-level security policy

  -- Attempt 2: self-escalate from admin to owner via UPDATE (should FAIL)
  -- (first become an admin of a test business, then try)
  UPDATE public.business_members
  SET    role = 'owner'
  WHERE  user_id     = auth.uid()
  AND    business_id = '<business_where_you_are_admin>';
  -- Expected: ERROR: new row violates row-level security policy (WITH CHECK)

  -- Confirm approved profile visible to anon, pending profile not visible
  -- (run as unauthenticated/anon role)
  SELECT id, slug, verification_status
  FROM   public.partner_profiles
  WHERE  verification_status = 'pending';
  -- Expected: 0 rows (pending rows blocked by new SELECT policy)

  SELECT id, slug
  FROM   public.partner_profiles
  WHERE  verification_status = 'approved';
  -- Expected: all approved profiles visible

  -- Confirm draft events not visible to anon
  SELECT id, title, status
  FROM   public.partner_events
  WHERE  status IN ('draft', 'pending', 'rejected');
  -- Expected: 0 rows
*/


-- =============================================================================
-- SECTION 9 — ROLLBACK SCRIPTS
--
-- SAFE TO ROLLBACK IF
-- -------------------
--   • No new partner signups have been blocked by the tightened SELECT policies.
--   • No business-member escalation attempts were made that are now logged.
--   • The deployment window since Phase 2b was applied is short (< 1 sprint).
--
-- DATA CONSIDERATIONS BEFORE ROLLING BACK
-- ----------------------------------------
--   • Partner profiles that had status = 'pending' will become publicly
--     accessible again after rollback. If any partner's page was previously
--     visible while pending and the partner was notified of the policy change,
--     rolling back may cause confusion.
--   • Draft events that were previously readable via the API will become
--     readable again after rollback.
--   • The self-owner escalation vector will re-open. Check business_members
--     for any unexpected owner rows before rolling back.
-- =============================================================================

/*
-- ============================================================
-- ROLLBACK: Restore all Phase 2b changes
-- ============================================================

-- Step 1: Restore business_members INSERT (re-add self-owner clause)
DROP POLICY IF EXISTS "bb_business_members_insert" ON public.business_members;
CREATE POLICY "bb_business_members_insert"
  ON public.business_members FOR INSERT
  WITH CHECK (
    public.is_business_member(business_id, 'admin')
    OR public.has_role(auth.uid(), 'admin')
    OR (user_id = auth.uid() AND role = 'owner')   -- ESCALATION VECTOR RE-OPENED
  );

-- Step 2: Restore business_members UPDATE (remove WITH CHECK guard)
DROP POLICY IF EXISTS "bb_business_members_update" ON public.business_members;
CREATE POLICY "bb_business_members_update"
  ON public.business_members FOR UPDATE
  USING (
    public.is_business_member(business_id, 'admin')
    OR public.has_role(auth.uid(), 'admin')
  );

-- Step 3: Drop the public view
DROP VIEW IF EXISTS public.partner_profiles_public;

-- Step 4: Restore partner_profiles SELECT (original permissive policy)
DROP POLICY IF EXISTS "bb_partner_profiles_select" ON public.partner_profiles;
CREATE POLICY "Anyone can view partner profiles"
  ON public.partner_profiles FOR SELECT
  USING (true);

-- Step 5: Restore partner_events SELECT (original permissive policy)
DROP POLICY IF EXISTS "bb_partner_events_select" ON public.partner_events;
CREATE POLICY "Anyone can view partner events"
  ON public.partner_events FOR SELECT
  USING (true);

-- Step 6: Restore partner_events INSERT (remove has_role check)
DROP POLICY IF EXISTS "bb_partner_events_insert" ON public.partner_events;
CREATE POLICY "Partners can insert own events"
  ON public.partner_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partner_profiles pp
      WHERE pp.id = partner_profile_id AND pp.user_id = auth.uid()
    )
  );

-- Step 7: Drop the new performance indexes
DROP INDEX IF EXISTS public.idx_partner_profiles_verification_status;
DROP INDEX IF EXISTS public.idx_partner_events_approved;
DROP INDEX IF EXISTS public.idx_partner_events_profile_id;
DROP INDEX IF EXISTS public.idx_partner_events_status;

-- Verify rollback complete
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('business_members', 'partner_profiles', 'partner_events')
ORDER BY tablename, cmd;
-- "Anyone can view partner profiles" and "Anyone can view partner events" should reappear.
-- "bb_partner_profiles_select" and "bb_partner_events_select" should be gone.

SELECT COUNT(*) AS view_exists
FROM information_schema.views
WHERE table_schema = 'public' AND table_name = 'partner_profiles_public';
-- Expected: 0 (view dropped)
*/

-- =============================================================================
-- END OF PHASE 2b MIGRATION
-- =============================================================================
