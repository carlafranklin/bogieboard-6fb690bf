-- =============================================================================
-- BogieBoard Ingestion Reliability Foundation Migration
-- File    : bogieboard_ingestion_reliability_migration.sql
-- Created : 2026-05-28
--
-- SCOPE
-- -----
-- This migration contains only schema additions for ingestion reliability.
-- No Edge Functions. No GitHub Actions. No frontend changes.
--
-- WHAT THIS MIGRATION DOES
-- -------------------------
-- Section 1  : feed_registry column additions (consecutive_failures,
--              backoff_until, last_success_at)
-- Section 2  : ingest_queue table + RLS + indexes
-- Section 3  : feed_processing_history table + RLS + indexes
-- Section 4  : source_events column additions (queue_job_id,
--              processing_started_at)
-- Section 5  : canonical_events column additions (source_feed_id,
--              ingest_run_id)
-- Section 6  : canonical_events.normalized_hash duplicate audit +
--              conditional unique index
-- Section 7  : Validation queries
-- Section 8  : Rollback script
--
-- IDEMPOTENCY
-- -----------
-- Every DDL statement uses IF NOT EXISTS / IF EXISTS guards.
-- Safe to run multiple times on the same database.
--
-- DEV-FIRST
-- ---------
-- Run and validate in the Dev Supabase project before applying to production.
-- The duplicate-hash audit in Section 6 must be reviewed before running
-- in production if any duplicates are found.
-- =============================================================================


-- =============================================================================
-- SECTION 1 — feed_registry column additions
--
-- consecutive_failures : incremented by ingest-worker on each failure;
--                        reset to 0 on success.
-- backoff_until        : when set, dispatcher skips this feed until the
--                        timestamp passes. Set by ingest-worker after 5+
--                        consecutive failures (circuit-breaker pattern).
-- last_success_at      : updated only on clean job completion; different from
--                        last_fetched_at which updates on every attempt.
-- =============================================================================

ALTER TABLE public.feed_registry
  ADD COLUMN IF NOT EXISTS consecutive_failures INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS backoff_until        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_success_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.feed_registry.consecutive_failures IS
  'Incremented by ingest-worker on each failed attempt. '
  'Reset to 0 on successful completion. '
  'When >= 5, ingest-worker sets backoff_until = now() + INTERVAL ''24 hours''.';

COMMENT ON COLUMN public.feed_registry.backoff_until IS
  'Circuit-breaker timestamp. '
  'ingest-dispatcher skips feeds where backoff_until > now(). '
  'Admin can reset by setting to NULL.';

COMMENT ON COLUMN public.feed_registry.last_success_at IS
  'Timestamp of the last fully successful ingestion run. '
  'Distinct from last_fetched_at which is set on every attempt. '
  'NULL means the feed has never completed successfully.';

-- Partial index: dispatcher query filters on backoff_until only when set.
CREATE INDEX IF NOT EXISTS idx_feed_registry_backoff
  ON public.feed_registry(backoff_until)
  WHERE backoff_until IS NOT NULL;


-- =============================================================================
-- SECTION 2 — ingest_queue table
--
-- PURPOSE
-- -------
-- One active job per feed at a time. The ingest-dispatcher inserts a row for
-- each due feed. The ingest-worker claims one row with SELECT FOR UPDATE
-- SKIP LOCKED, processes it, and marks it completed or failed.
--
-- STATUS LIFECYCLE
-- ----------------
-- pending → (worker claims) → running → completed
--                                     → failed (worker sets next_run_at for retry)
-- pending → skipped (dispatcher skips if backoff_until is in the future)
--
-- CONCURRENCY SAFETY
-- ------------------
-- The partial unique index on (feed_id) WHERE status IN ('pending','running')
-- prevents the dispatcher from enqueuing a second job while one is already
-- active. ON CONFLICT DO NOTHING is used by the dispatcher.
--
-- locked_by stores a worker instance identifier (e.g. a UUID generated at
-- Edge Function invocation time) so stuck-job detection can distinguish
-- which invocation locked a row.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ingest_queue (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feed_id       UUID        NOT NULL REFERENCES public.feed_registry(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  attempt_count INT         NOT NULL DEFAULT 0,
  max_attempts  INT         NOT NULL DEFAULT 5,
  next_run_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at     TIMESTAMPTZ,
  locked_by     TEXT,
  last_cursor   JSONB       NOT NULL DEFAULT '{}',
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ingest_queue IS
  'One active job per feed at a time. '
  'Dispatcher inserts; worker claims via SELECT FOR UPDATE SKIP LOCKED. '
  'Partial unique index prevents duplicate active jobs per feed.';

COMMENT ON COLUMN public.ingest_queue.last_cursor IS
  'Checkpoint state written by the worker after each successfully processed '
  'item. Enables resumption without reprocessing already-written events. '
  'Format varies by feed_type: '
  'RSS: {"last_guid": "...", "last_pub_date": "..."} '
  'iCal: {"last_uid": "...", "last_sequence": N} '
  'HTML: {"page": N, "last_event_date": "..."} '
  'API:  {"since_ts": "...", "next_page_token": "..."}';

COMMENT ON COLUMN public.ingest_queue.locked_by IS
  'Worker instance identifier (UUID generated at Edge Function start). '
  'Used by ingest-cleanup to attribute stuck jobs to a specific invocation.';

-- updated_at trigger (DROP first so CREATE is idempotent on re-run)
DROP TRIGGER IF EXISTS trg_ingest_queue_updated ON public.ingest_queue;
CREATE TRIGGER trg_ingest_queue_updated
  BEFORE UPDATE ON public.ingest_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.ingest_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view ingest queue"    ON public.ingest_queue;
DROP POLICY IF EXISTS "Admins can manage ingest queue"  ON public.ingest_queue;

CREATE POLICY "Admins can view ingest queue"
  ON public.ingest_queue FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage ingest queue"
  ON public.ingest_queue FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Indexes
-- 1. Partial unique: only one active job per feed at a time.
--    Dispatcher uses: INSERT ... ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ingest_queue_active_feed
  ON public.ingest_queue(feed_id)
  WHERE status IN ('pending', 'running');

-- 2. Dispatcher poll: find pending jobs due to run.
CREATE INDEX IF NOT EXISTS idx_ingest_queue_pending
  ON public.ingest_queue(next_run_at)
  WHERE status = 'pending';

-- 3. Cleanup poll: find stuck running jobs.
CREATE INDEX IF NOT EXISTS idx_ingest_queue_stuck
  ON public.ingest_queue(locked_at)
  WHERE status = 'running';

-- 4. Feed-level lookup: admin dashboard, per-feed history.
CREATE INDEX IF NOT EXISTS idx_ingest_queue_feed
  ON public.ingest_queue(feed_id, created_at DESC);


-- =============================================================================
-- SECTION 3 — feed_processing_history table
--
-- PURPOSE
-- -------
-- Append-only log of every ingest-worker invocation outcome.
-- Gives the admin dashboard a per-feed timeline of: what ran, when,
-- how long, how many events were processed, whether it timed out,
-- and the exact error if it failed.
--
-- RELATIONSHIP TO OTHER TABLES
-- ----------------------------
-- feed_id           → feed_registry.id (the feed that was processed)
-- queue_job_id      → ingest_queue.id  (the queue job this run serviced)
-- ingestion_run_id  → ingestion_runs.id (nullable: linked when a matching
--                     ingestion_runs row was created for this attempt)
--
-- NOTE: source_id (FK to sources) is intentionally omitted. feed_registry and
-- sources are separate schemas; not all feed_registry rows have a matching
-- sources row. Carrying source_id here would require a nullable FK that adds
-- complexity without benefit for the ingestion worker.
--
-- APPEND-ONLY ENFORCEMENT
-- -----------------------
-- No UPDATE or DELETE RLS policies. The worker INSERTs one row per attempt
-- via a SECURITY DEFINER function (Task 1.3). Rows are never modified after
-- creation, making this table a reliable audit trail.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.feed_processing_history (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  -- relationships
  feed_id             UUID        NOT NULL REFERENCES public.feed_registry(id) ON DELETE CASCADE,
  queue_job_id        UUID        REFERENCES public.ingest_queue(id) ON DELETE SET NULL,
  ingestion_run_id    UUID        REFERENCES public.ingestion_runs(id) ON DELETE SET NULL,

  -- worker identity
  worker_id           TEXT,                  -- UUID generated at Edge Function start
  attempt_number      INT         NOT NULL DEFAULT 1,

  -- outcome
  status              TEXT        NOT NULL
                        CHECK (status IN ('completed', 'failed', 'partial', 'timeout', 'skipped')),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  duration_ms         INT,                   -- computed by worker: finished_at - started_at in ms

  -- event counts
  events_found        INT         NOT NULL DEFAULT 0,
  events_created      INT         NOT NULL DEFAULT 0,
  events_updated      INT         NOT NULL DEFAULT 0,
  events_skipped      INT         NOT NULL DEFAULT 0,
  events_failed       INT         NOT NULL DEFAULT 0,

  -- checkpoint
  last_cursor         JSONB       NOT NULL DEFAULT '{}',

  -- error detail
  error_type          TEXT,                  -- e.g. 'timeout', 'http_error', 'parse_error', 'db_error'
  error_message       TEXT,

  -- http metadata
  http_status         INT,                   -- HTTP status code from the feed fetch
  response_bytes      INT,                   -- bytes received before timeout or completion

  -- retry signal
  timeout_occurred    BOOLEAN     NOT NULL DEFAULT false,
  retry_scheduled_at  TIMESTAMPTZ,           -- next_run_at value set on the queue job after failure

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feed_processing_history IS
  'Append-only audit log of every ingest-worker invocation. '
  'One row per attempt. Never updated or deleted. '
  'Inserted only via the ingest-worker Edge Function (SECURITY DEFINER path). '
  'No client-side INSERT/UPDATE/DELETE policies.';

COMMENT ON COLUMN public.feed_processing_history.duration_ms IS
  'Wall-clock duration in milliseconds. Computed by the worker as '
  'Date.now() at finish minus Date.now() at start. '
  'NULL if the worker crashed before recording a finish time.';

COMMENT ON COLUMN public.feed_processing_history.worker_id IS
  'UUID generated at the start of each Edge Function invocation. '
  'Matches ingest_queue.locked_by for the same job.';

-- RLS
ALTER TABLE public.feed_processing_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view feed processing history"
  ON public.feed_processing_history;

CREATE POLICY "Admins can view feed processing history"
  ON public.feed_processing_history FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policies: only SECURITY DEFINER worker function writes here.

-- Indexes
-- 1. Primary admin dashboard query: latest history per feed.
CREATE INDEX IF NOT EXISTS idx_feed_processing_history_feed
  ON public.feed_processing_history(feed_id, created_at DESC);

-- 2. Queue job lookup: admin detail view for a specific run.
CREATE INDEX IF NOT EXISTS idx_feed_processing_history_job
  ON public.feed_processing_history(queue_job_id);

-- 3. Failure analysis: filter by status across all feeds.
CREATE INDEX IF NOT EXISTS idx_feed_processing_history_status
  ON public.feed_processing_history(status, created_at DESC)
  WHERE status IN ('failed', 'timeout', 'partial');

-- 4. Ingestion run linkage.
CREATE INDEX IF NOT EXISTS idx_feed_processing_history_run
  ON public.feed_processing_history(ingestion_run_id)
  WHERE ingestion_run_id IS NOT NULL;


-- =============================================================================
-- SECTION 4 — source_events column additions
--
-- queue_job_id         : links a source_events row to the ingest_queue job
--                        that produced it; enables per-job event auditing.
-- processing_started_at: timestamp when the worker began processing this
--                        specific item; useful for per-item latency analysis.
--
-- source_events already has feed_id (added in a prior migration).
-- =============================================================================

ALTER TABLE public.source_events
  ADD COLUMN IF NOT EXISTS queue_job_id          UUID REFERENCES public.ingest_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.source_events.queue_job_id IS
  'The ingest_queue job that produced this source_events row. '
  'ON DELETE SET NULL: row survives queue job cleanup.';

COMMENT ON COLUMN public.source_events.processing_started_at IS
  'Timestamp when the worker began processing this item. '
  'Combined with fetched_at gives per-item processing latency.';

CREATE INDEX IF NOT EXISTS idx_source_events_queue_job
  ON public.source_events(queue_job_id)
  WHERE queue_job_id IS NOT NULL;


-- =============================================================================
-- SECTION 5 — canonical_events column additions
--
-- source_feed_id : the feed_registry row that last produced or refreshed
--                  this event; enables per-feed event attribution.
-- ingest_run_id  : the ingestion_runs row for the run that last wrote this
--                  event; nullable because not all events will have a
--                  matching ingestion_runs row (dual-schema situation).
--
-- Both are ON DELETE SET NULL so canonical events survive feed/run deletion.
-- =============================================================================

ALTER TABLE public.canonical_events
  ADD COLUMN IF NOT EXISTS source_feed_id UUID REFERENCES public.feed_registry(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ingest_run_id  UUID REFERENCES public.ingestion_runs(id)  ON DELETE SET NULL;

COMMENT ON COLUMN public.canonical_events.source_feed_id IS
  'The feed_registry feed that last produced or refreshed this event. '
  'NULL for events ingested before this column was added, or ingested '
  'from a sources-based pipeline without a feed_registry entry.';

COMMENT ON COLUMN public.canonical_events.ingest_run_id IS
  'The ingestion_runs row for the run that last wrote this event. '
  'NULL when the event predates this column or was created outside '
  'the ingestion_runs pipeline.';

CREATE INDEX IF NOT EXISTS idx_canonical_events_source_feed
  ON public.canonical_events(source_feed_id)
  WHERE source_feed_id IS NOT NULL;


-- =============================================================================
-- SECTION 6 — canonical_events.normalized_hash: duplicate audit +
--             conditional unique index
--
-- APPROACH
-- --------
-- 1. Count duplicate normalized_hash values (excluding NULL).
-- 2. If duplicates exist: RAISE NOTICE with count and a DO NOT proceed
--    message. Skip unique index creation.
-- 3. If no duplicates exist: CREATE UNIQUE INDEX IF NOT EXISTS.
--
-- WHY CREATE UNIQUE INDEX NOT ALTER TABLE ADD CONSTRAINT
-- -------------------------------------------------------
-- ALTER TABLE ADD CONSTRAINT UNIQUE acquires AccessExclusiveLock and rewrites
-- the index from scratch even if a btree index already exists on the column.
-- CREATE UNIQUE INDEX IF NOT EXISTS on a column that has an existing plain
-- btree index (idx_canonical_events_hash) will create a second index, which
-- is acceptable and explicit. We could drop the old index after, but that
-- is left as a manual step after validation to avoid lock contention in
-- production.
--
-- AFTER DEDUPLICATION (when duplicates are found):
-- ------------------------------------------------
-- Review duplicates with the query in Section 7 validation.
-- Keep the row with the latest last_refreshed_at per hash.
-- After manual cleanup, re-run Section 6 only to create the index.
--
-- NOTE ON idx_canonical_events_hash
-- ----------------------------------
-- The existing plain btree index on normalized_hash (idx_canonical_events_hash)
-- is NOT dropped by this migration. After the unique index is successfully
-- created, you may optionally DROP INDEX idx_canonical_events_hash to avoid
-- maintaining a redundant index. That drop is a separate, explicit step.
-- =============================================================================

DO $$
DECLARE
  _dup_count INT;
BEGIN
  -- Count distinct normalized_hash values that appear more than once
  SELECT COUNT(*) INTO _dup_count
  FROM (
    SELECT normalized_hash
    FROM   public.canonical_events
    WHERE  normalized_hash IS NOT NULL
    GROUP  BY normalized_hash
    HAVING COUNT(*) > 1
  ) dupes;

  IF _dup_count > 0 THEN
    RAISE NOTICE
      '================================================================';
    RAISE NOTICE
      'DUPLICATE normalized_hash VALUES FOUND: % distinct hash(es) have '
      'more than one canonical_events row.', _dup_count;
    RAISE NOTICE
      'The unique index uq_canonical_events_hash was NOT created.';
    RAISE NOTICE
      'ACTION REQUIRED before re-running this section:';
    RAISE NOTICE
      '  1. Run the duplicate review query in Section 7 (validation 7f).';
    RAISE NOTICE
      '  2. For each duplicate hash, keep the row with the latest';
    RAISE NOTICE
      '     last_refreshed_at and delete the others.';
    RAISE NOTICE
      '  3. Re-run this migration (Section 6 is idempotent via IF NOT EXISTS).';
    RAISE NOTICE
      '================================================================';
  ELSE
    RAISE NOTICE 'No duplicate normalized_hash values found. Creating unique index.';

    -- Create a normal (non-partial) unique index.
    -- Postgres unique indexes permit multiple NULL values by definition, so
    -- rows where normalized_hash IS NULL do not conflict with each other.
    -- A non-partial index is required for ON CONFLICT (normalized_hash) in
    -- the ingest-worker upsert and for Supabase upsert behavior; Postgres
    -- requires the conflict target to reference a unique index that covers
    -- exactly the column(s) listed without a WHERE predicate.
    EXECUTE $sql$
      CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_events_hash
        ON public.canonical_events(normalized_hash)
    $sql$;

    RAISE NOTICE 'uq_canonical_events_hash created successfully.';
  END IF;
END;
$$;


-- =============================================================================
-- SECTION 7 — VALIDATION QUERIES
-- All SELECT only. Run immediately after applying in Dev.
-- =============================================================================

-- 7a. feed_registry: three new columns exist with correct defaults
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'feed_registry'
  AND  column_name  IN ('consecutive_failures', 'backoff_until', 'last_success_at')
ORDER  BY column_name;
-- Expected: 3 rows
-- consecutive_failures : integer, NO (not nullable), default 0
-- backoff_until        : timestamp with time zone, YES (nullable), no default
-- last_success_at      : timestamp with time zone, YES (nullable), no default

-- 7b. ingest_queue: table, columns, and RLS
SELECT table_name
FROM   information_schema.tables
WHERE  table_schema = 'public' AND table_name = 'ingest_queue';
-- Expected: 1 row

SELECT column_name, data_type, is_nullable, column_default
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'ingest_queue'
ORDER  BY ordinal_position;
-- Expected: id, feed_id, status (DEFAULT 'pending'), attempt_count (DEFAULT 0),
--           max_attempts (DEFAULT 5), next_run_at (DEFAULT now()), locked_at,
--           locked_by, last_cursor (DEFAULT '{}'), last_error, created_at, updated_at

SELECT
  COUNT(*)                                       AS total_policies,
  COUNT(*) FILTER (WHERE cmd = 'SELECT')         AS select_count,
  COUNT(*) FILTER (WHERE cmd = 'INSERT')         AS insert_count,
  COUNT(*) FILTER (WHERE cmd = 'UPDATE')         AS update_count,
  COUNT(*) FILTER (WHERE cmd = 'DELETE')         AS delete_count
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'ingest_queue';
-- Expected: 2 policies (SELECT + ALL), INSERT/UPDATE/DELETE count may be 1 (ALL covers them)

-- 7c. ingest_queue: partial unique index prevents duplicate active jobs
SELECT indexname, indexdef
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  tablename  = 'ingest_queue'
  AND  indexname  = 'uq_ingest_queue_active_feed';
-- Expected: 1 row, WHERE clause includes status IN ('pending', 'running')

-- 7d. feed_processing_history: table, RLS, no INSERT/UPDATE/DELETE policies
SELECT table_name
FROM   information_schema.tables
WHERE  table_schema = 'public' AND table_name = 'feed_processing_history';
-- Expected: 1 row

SELECT
  COUNT(*)                                       AS total_policies,
  COUNT(*) FILTER (WHERE cmd = 'SELECT')         AS select_policies,
  COUNT(*) FILTER (WHERE cmd = 'INSERT')         AS insert_policies,
  COUNT(*) FILTER (WHERE cmd = 'UPDATE')         AS update_policies,
  COUNT(*) FILTER (WHERE cmd = 'DELETE')         AS delete_policies
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'feed_processing_history';
-- Expected: total=1, select=1, insert=0, update=0, delete=0

-- 7e. source_events: two new columns exist
SELECT column_name
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'source_events'
  AND  column_name  IN ('queue_job_id', 'processing_started_at');
-- Expected: 2 rows

-- 7f. canonical_events: two new columns + duplicate hash audit
SELECT column_name
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'canonical_events'
  AND  column_name  IN ('source_feed_id', 'ingest_run_id');
-- Expected: 2 rows

-- Duplicate review query (run this if Section 6 reported duplicates):
SELECT
  normalized_hash,
  COUNT(*)                                     AS duplicate_count,
  MIN(created_at)                              AS oldest_created_at,
  MAX(last_refreshed_at)                       AS newest_refreshed_at,
  array_agg(id ORDER BY last_refreshed_at DESC) AS ids_newest_first
FROM   public.canonical_events
WHERE  normalized_hash IS NOT NULL
GROUP  BY normalized_hash
HAVING COUNT(*) > 1
ORDER  BY duplicate_count DESC, normalized_hash
LIMIT  50;
-- Expected: 0 rows (no duplicates)
-- If rows returned: review, keep the id at position [1] in ids_newest_first per hash,
-- delete the rest, then re-run Section 6.

-- 7g. Unique index status on canonical_events
SELECT indexname, indexdef
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  tablename  = 'canonical_events'
  AND  indexname  = 'uq_canonical_events_hash';
-- Expected: 1 row if no duplicates were found
-- Expected: 0 rows if duplicates were found (check NOTICE output)

-- 7h. Confirm existing plain hash index still exists (not dropped)
SELECT indexname
FROM   pg_indexes
WHERE  schemaname = 'public'
  AND  tablename  = 'canonical_events'
  AND  indexname  = 'idx_canonical_events_hash';
-- Expected: 1 row (the original plain index, kept for now)

-- 7i. End-to-end: simulate a dispatcher insert then check uniqueness guard
-- (Run manually in Supabase SQL editor with a real feed_id; do not run in migration)
/*
  -- Step 1: insert first job
  INSERT INTO public.ingest_queue (feed_id)
  SELECT id FROM public.feed_registry WHERE enabled = true LIMIT 1;

  -- Step 2: attempt duplicate (should be silently ignored by ON CONFLICT DO NOTHING)
  INSERT INTO public.ingest_queue (feed_id)
  SELECT id FROM public.feed_registry WHERE enabled = true LIMIT 1
  ON CONFLICT DO NOTHING;

  -- Expected: 1 row in ingest_queue for that feed_id with status='pending'
  SELECT feed_id, status, COUNT(*) FROM public.ingest_queue GROUP BY feed_id, status;
*/


-- =============================================================================
-- SECTION 8 — ROLLBACK SCRIPT
--
-- Run as a standalone script to remove all objects created by this migration.
-- Back up data first: pg_dump -t ingest_queue -t feed_processing_history <conn>
-- =============================================================================

/*
-- ============================================================
-- ROLLBACK: Remove all ingestion reliability migration objects
-- ============================================================

-- Step 1: Drop tables (CASCADE removes dependent indexes, triggers, policies)
DROP TABLE IF EXISTS public.feed_processing_history  CASCADE;
DROP TABLE IF EXISTS public.ingest_queue             CASCADE;

-- Step 2: Drop unique index on canonical_events (if created)
DROP INDEX IF EXISTS public.uq_canonical_events_hash;

-- Step 3: Remove columns added to existing tables
ALTER TABLE public.canonical_events
  DROP COLUMN IF EXISTS source_feed_id,
  DROP COLUMN IF EXISTS ingest_run_id;

ALTER TABLE public.source_events
  DROP COLUMN IF EXISTS queue_job_id,
  DROP COLUMN IF EXISTS processing_started_at;

ALTER TABLE public.feed_registry
  DROP COLUMN IF EXISTS consecutive_failures,
  DROP COLUMN IF EXISTS backoff_until,
  DROP COLUMN IF EXISTS last_success_at;

-- Step 4: Drop the backoff index (if table drop did not cascade it)
DROP INDEX IF EXISTS public.idx_feed_registry_backoff;

-- Step 5: Verify rollback
SELECT table_name
FROM   information_schema.tables
WHERE  table_schema = 'public'
  AND  table_name IN ('ingest_queue', 'feed_processing_history');
-- Expected: 0 rows

SELECT column_name
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'feed_registry'
  AND  column_name  IN ('consecutive_failures', 'backoff_until', 'last_success_at');
-- Expected: 0 rows
*/

-- =============================================================================
-- END OF INGESTION RELIABILITY FOUNDATION MIGRATION
-- =============================================================================
