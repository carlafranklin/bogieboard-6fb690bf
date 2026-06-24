-- =============================================================================
-- BogieBoard — Dev Feed Registry Seed Migration
-- File : bogieboard_feed_registry_seed_dev.sql
-- Env  : DEV ONLY — do not apply to Production.
--
-- Seeds feed_registry with three Ticketmaster Discovery API feed definitions
-- for the three confirmed metro_areas slugs:
--   charlotte-nc, greensboro-nc, raleigh-durham-nc
--
-- Wilmington is intentionally deferred. No metro_areas row with
-- slug = 'wilmington-nc' exists. Add that row first, then append
-- a fourth INSERT block here.
--
-- API KEY POLICY
-- The Ticketmaster apikey is never stored in the database.
-- The ingest-worker appends it from the TICKETMASTER_API_KEY environment
-- secret at call time. The feed_url values below contain only static,
-- non-secret query parameters.
--
-- IDEMPOTENCY
-- ON CONFLICT (feed_url) DO NOTHING — safe to rerun.
-- feed_url has a UNIQUE constraint and is the natural idempotency key.
--
-- ENUM VALUES CONFIRMED
--   feed_type        : 'auto'  (rss | ical | auto | html)
--   source_category  : 'other' (city | parks_rec | library | venue | other)
--   refresh_frequency: 'daily' (hourly | daily)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- SECTION 1 — Prerequisite guard
-- Abort if any required metro_areas row is missing to prevent inserts
-- with dangling slug references.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.metro_areas WHERE slug = 'charlotte-nc'
  ) THEN
    RAISE EXCEPTION
      'Prerequisite failed: metro_areas has no row with slug = ''charlotte-nc''. '
      'Run the metro_areas seed migration before this script.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.metro_areas WHERE slug = 'greensboro-nc'
  ) THEN
    RAISE EXCEPTION
      'Prerequisite failed: metro_areas has no row with slug = ''greensboro-nc''. '
      'Run the metro_areas seed migration before this script.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.metro_areas WHERE slug = 'raleigh-durham-nc'
  ) THEN
    RAISE EXCEPTION
      'Prerequisite failed: metro_areas has no row with slug = ''raleigh-durham-nc''. '
      'Run the metro_areas seed migration before this script.';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- SECTION 2 — Seed feeds
--
-- feed_url encodes all static Ticketmaster Discovery API parameters.
-- Parameters intentionally included:
--   latlong    centre point for the metro radius search
--   radius     search radius in miles
--   unit       miles (Ticketmaster default is km; explicit for safety)
--   countryCode=US
--   size       100 results per page (Ticketmaster max is 200;
--              100 chosen to stay well within the 25-second worker timeout)
--   sort       date,asc — earliest events returned first, matching
--              the BogieBoard discovery experience
--
-- Parameters intentionally excluded from feed_url:
--   apikey  — worker appends from TICKETMASTER_API_KEY env secret
--   page    — worker manages via ingest_queue.last_cursor JSON field
-- ---------------------------------------------------------------------------

INSERT INTO public.feed_registry (
  feed_name,
  feed_url,
  feed_type,
  metro_area_slug,
  source_category,
  refresh_frequency,
  scrape_interval_hours,
  enabled,
  default_city,
  default_state
)
VALUES

  -- ── 1. Charlotte Metro ────────────────────────────────────────────────────
  -- Centre: 35.2271, -80.8431 | Radius: 30 miles
  (
    'Ticketmaster — Charlotte Metro',
    'https://app.ticketmaster.com/discovery/v2/events.json'
    '?latlong=35.2271%2C-80.8431'
    '&radius=30'
    '&unit=miles'
    '&countryCode=US'
    '&size=100'
    '&sort=date%2Casc',
    'auto',
    'charlotte-nc',
    'other',
    'daily',
    12,
    true,
    'Charlotte',
    'NC'
  ),

  -- ── 2. Greensboro / Triad Metro ───────────────────────────────────────────
  -- Centre: 36.0726, -79.7920 | Radius: 25 miles
  (
    'Ticketmaster — Greensboro/Triad Metro',
    'https://app.ticketmaster.com/discovery/v2/events.json'
    '?latlong=36.0726%2C-79.7920'
    '&radius=25'
    '&unit=miles'
    '&countryCode=US'
    '&size=100'
    '&sort=date%2Casc',
    'auto',
    'greensboro-nc',
    'other',
    'daily',
    12,
    true,
    'Greensboro',
    'NC'
  ),

  -- ── 3. Raleigh-Durham / Triangle Metro ────────────────────────────────────
  -- Centre: 35.7796, -78.6382 | Radius: 30 miles
  (
    'Ticketmaster — Raleigh-Durham/Triangle Metro',
    'https://app.ticketmaster.com/discovery/v2/events.json'
    '?latlong=35.7796%2C-78.6382'
    '&radius=30'
    '&unit=miles'
    '&countryCode=US'
    '&size=100'
    '&sort=date%2Casc',
    'auto',
    'raleigh-durham-nc',
    'other',
    'daily',
    12,
    true,
    'Raleigh',
    'NC'
  )

  -- ── Wilmington: intentionally deferred ────────────────────────────────────
  -- No metro_areas row with slug = 'wilmington-nc' exists.
  -- Add that row to metro_areas first, then insert a fourth block here.

ON CONFLICT (feed_url) DO NOTHING;


-- ---------------------------------------------------------------------------
-- SECTION 3 — Post-insert notice
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  _count INT;
BEGIN
  SELECT COUNT(*) INTO _count
  FROM   public.feed_registry
  WHERE  feed_name LIKE 'Ticketmaster — %';

  RAISE NOTICE 'feed_registry now contains % Ticketmaster feed row(s).', _count;
END;
$$;

-- =============================================================================
-- END OF DEV SEED MIGRATION
-- =============================================================================
