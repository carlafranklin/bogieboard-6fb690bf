
-- ============================================================
-- BogieBoard Aggregation Schema - Tables, Indexes, RLS
-- ============================================================

-- 1. Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;

-- 2. METRO AREAS
CREATE TABLE public.metro_areas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  core_cities JSONB NOT NULL DEFAULT '[]',
  included_counties JSONB NOT NULL DEFAULT '[]',
  included_zip_prefixes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.metro_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view metro areas" ON public.metro_areas FOR SELECT USING (true);
CREATE POLICY "Only admins can manage metro areas" ON public.metro_areas FOR ALL USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.metro_areas (name, slug, core_cities, included_counties, included_zip_prefixes) VALUES
  ('Charlotte, NC Metro', 'charlotte-nc',
   '["Charlotte","Gastonia","Concord","Rock Hill","Huntersville","Kannapolis","Matthews","Monroe","Mooresville","Salisbury","Shelby","Statesville","Belmont","Cornelius","Davidson","Fort Mill","Indian Trail"]',
   '["Mecklenburg","Gaston","Cabarrus","Union","Iredell","Rowan","Cleveland","Lincoln","Stanly","York (SC)","Lancaster (SC)"]',
   '["280","281","282","283","297"]'),
  ('Greensboro, NC Metro', 'greensboro-nc',
   '["Greensboro","High Point","Asheboro","Jamestown","Oak Ridge","Pleasant Garden","Sedalia","Stokesdale","Summerfield","Randleman","Reidsville"]',
   '["Guilford","Randolph","Rockingham","Alamance","Forsyth"]',
   '["270","271","272","273","274"]');

-- 3. VENUES
CREATE TABLE public.venues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, address_1 TEXT, address_2 TEXT, city TEXT, state TEXT, zip TEXT, county TEXT,
  latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
  metro_area_id UUID REFERENCES public.metro_areas(id),
  venue_url TEXT, phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_venues_metro ON public.venues(metro_area_id);
CREATE INDEX idx_venues_city ON public.venues(city);
CREATE INDEX idx_venues_zip ON public.venues(zip);
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view venues" ON public.venues FOR SELECT USING (true);
CREATE POLICY "Admins can manage venues" ON public.venues FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 4. EVOLVE CATEGORIES
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_category_id UUID REFERENCES public.categories(id),
  ADD COLUMN IF NOT EXISTS icon TEXT;

-- 5. CANONICAL EVENTS
DO $$ BEGIN CREATE TYPE public.event_status AS ENUM ('active','cancelled','postponed','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.canonical_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL, description_short TEXT, description_long TEXT,
  start_time TIMESTAMPTZ NOT NULL, end_time TIMESTAMPTZ, all_day BOOLEAN NOT NULL DEFAULT false,
  venue_id UUID REFERENCES public.venues(id), organizer_name TEXT,
  age_restriction INTEGER, price_min NUMERIC, price_max NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD', is_free BOOLEAN NOT NULL DEFAULT false,
  ticket_url TEXT, image_url TEXT,
  status public.event_status NOT NULL DEFAULT 'active',
  metro_area_id UUID REFERENCES public.metro_areas(id),
  normalized_hash TEXT, event_series_id UUID,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_canonical_events_start ON public.canonical_events(start_time);
CREATE INDEX idx_canonical_events_metro ON public.canonical_events(metro_area_id);
CREATE INDEX idx_canonical_events_status ON public.canonical_events(status);
CREATE INDEX idx_canonical_events_hash ON public.canonical_events(normalized_hash);
CREATE INDEX idx_canonical_events_refreshed ON public.canonical_events(last_refreshed_at);
CREATE INDEX idx_canonical_events_venue ON public.canonical_events(venue_id);
CREATE INDEX idx_canonical_events_series ON public.canonical_events(event_series_id);
CREATE INDEX idx_canonical_events_search ON public.canonical_events(metro_area_id, start_time, status) WHERE status = 'active';
ALTER TABLE public.canonical_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view canonical events" ON public.canonical_events FOR SELECT USING (true);
CREATE POLICY "Service role manages canonical events" ON public.canonical_events FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_canonical_events_updated BEFORE UPDATE ON public.canonical_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. EVENT_CATEGORIES
CREATE TABLE public.event_categories (
  event_id UUID NOT NULL REFERENCES public.canonical_events(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, category_id)
);
CREATE INDEX idx_event_categories_cat ON public.event_categories(category_id, event_id);
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view event categories" ON public.event_categories FOR SELECT USING (true);
CREATE POLICY "Admins manage event categories" ON public.event_categories FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 7. SOURCES
DO $$ BEGIN CREATE TYPE public.source_type AS ENUM ('api','rss','ical','scrape','manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, type public.source_type NOT NULL, base_url TEXT, auth_method TEXT,
  rate_limit_notes TEXT, trust_score INTEGER NOT NULL DEFAULT 50 CHECK (trust_score BETWEEN 0 AND 100),
  metro_area_id UUID REFERENCES public.metro_areas(id), config JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view sources" ON public.sources FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage sources" ON public.sources FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_sources_updated BEFORE UPDATE ON public.sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. SOURCE EVENTS
DO $$ BEGIN CREATE TYPE public.parse_status AS ENUM ('pending','parsed','matched','failed','skipped'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.source_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  external_event_id TEXT, source_url TEXT, raw_payload JSONB,
  normalized_hash TEXT, parse_status public.parse_status NOT NULL DEFAULT 'pending',
  canonical_event_id UUID REFERENCES public.canonical_events(id) ON DELETE SET NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_source_events_source ON public.source_events(source_id);
CREATE INDEX idx_source_events_hash ON public.source_events(normalized_hash);
CREATE INDEX idx_source_events_canonical ON public.source_events(canonical_event_id);
CREATE INDEX idx_source_events_external ON public.source_events(source_id, external_event_id);
CREATE INDEX idx_source_events_status ON public.source_events(parse_status);
ALTER TABLE public.source_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view source events" ON public.source_events FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage source events" ON public.source_events FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 9. INGESTION RUNS + ERRORS
DO $$ BEGIN CREATE TYPE public.ingestion_status AS ENUM ('running','completed','failed','partial'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.ingestion_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ,
  status public.ingestion_status NOT NULL DEFAULT 'running',
  records_fetched INTEGER DEFAULT 0, records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0, records_skipped INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0, metadata JSONB DEFAULT '{}'
);
CREATE INDEX idx_ingestion_runs_source ON public.ingestion_runs(source_id);
CREATE INDEX idx_ingestion_runs_started ON public.ingestion_runs(started_at DESC);
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view ingestion runs" ON public.ingestion_runs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage ingestion runs" ON public.ingestion_runs FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ingestion_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ingestion_run_id UUID NOT NULL REFERENCES public.ingestion_runs(id) ON DELETE CASCADE,
  event_source_url TEXT, error_type TEXT NOT NULL, message TEXT, raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ingestion_errors_run ON public.ingestion_errors(ingestion_run_id);
ALTER TABLE public.ingestion_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view ingestion errors" ON public.ingestion_errors FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage ingestion errors" ON public.ingestion_errors FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 10. EVENT SERIES
CREATE TABLE public.event_series (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL, rrule TEXT,
  venue_id UUID REFERENCES public.venues(id), organizer_name TEXT,
  metro_area_id UUID REFERENCES public.metro_areas(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.event_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view event series" ON public.event_series FOR SELECT USING (true);
CREATE POLICY "Admins manage event series" ON public.event_series FOR ALL USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.canonical_events ADD CONSTRAINT fk_canonical_events_series
  FOREIGN KEY (event_series_id) REFERENCES public.event_series(id) ON DELETE SET NULL;

-- 11. SEARCH TELEMETRY
CREATE TABLE public.search_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  searched_city_or_zip TEXT, metro_area_id UUID REFERENCES public.metro_areas(id),
  category_slug TEXT, date_from DATE, date_to DATE, results_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_search_logs_created ON public.search_logs(created_at DESC);
CREATE INDEX idx_search_logs_metro ON public.search_logs(metro_area_id);
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert search logs" ON public.search_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view search logs" ON public.search_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.click_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  canonical_event_id UUID REFERENCES public.canonical_events(id) ON DELETE SET NULL,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  click_type TEXT NOT NULL DEFAULT 'outbound',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_click_logs_event ON public.click_logs(canonical_event_id);
CREATE INDEX idx_click_logs_created ON public.click_logs(created_at DESC);
ALTER TABLE public.click_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert click logs" ON public.click_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view click logs" ON public.click_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 12. HELPER FUNCTIONS (no geospatial ones - those come in next migration)
CREATE OR REPLACE FUNCTION public.generate_event_hash(
  p_title TEXT, p_start_time TIMESTAMPTZ, p_city TEXT, p_venue_name TEXT DEFAULT NULL
) RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(
    lower(trim(regexp_replace(p_title, '[^a-zA-Z0-9 ]', '', 'g')))
    || '|' || to_char(p_start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
    || '|' || lower(trim(COALESCE(p_city, '')))
    || '|' || lower(trim(COALESCE(p_venue_name, '')))
  );
$$;

-- search_events function (no geospatial types needed)
CREATE OR REPLACE FUNCTION public.search_events(
  p_metro_slug TEXT DEFAULT NULL, p_category_slug TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT now(), p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
  event_id UUID, title TEXT, description_short TEXT,
  start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, all_day BOOLEAN,
  is_free BOOLEAN, price_min NUMERIC, price_max NUMERIC,
  ticket_url TEXT, image_url TEXT, age_restriction INTEGER,
  status public.event_status,
  venue_name TEXT, venue_city TEXT, venue_state TEXT, venue_zip TEXT,
  venue_lat DOUBLE PRECISION, venue_lon DOUBLE PRECISION,
  metro_name TEXT, category_names TEXT[]
) LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT
    ce.id, ce.title, ce.description_short, ce.start_time, ce.end_time, ce.all_day,
    ce.is_free, ce.price_min, ce.price_max, ce.ticket_url, ce.image_url, ce.age_restriction, ce.status,
    v.name, v.city, v.state, v.zip, v.latitude, v.longitude,
    ma.name,
    ARRAY(SELECT c.name FROM public.categories c JOIN public.event_categories ec2 ON ec2.category_id = c.id WHERE ec2.event_id = ce.id)
  FROM public.canonical_events ce
  LEFT JOIN public.venues v ON ce.venue_id = v.id
  LEFT JOIN public.metro_areas ma ON ce.metro_area_id = ma.id
  WHERE ce.status = 'active'
    AND ce.start_time >= p_date_from
    AND (p_date_to IS NULL OR ce.start_time <= p_date_to)
    AND (p_metro_slug IS NULL OR ma.slug = p_metro_slug)
    AND (p_category_slug IS NULL OR EXISTS (
      SELECT 1 FROM public.event_categories ec JOIN public.categories c ON c.id = ec.category_id
      WHERE ec.event_id = ce.id AND c.slug = p_category_slug
    ))
  ORDER BY ce.start_time ASC LIMIT p_limit OFFSET p_offset;
$$;
