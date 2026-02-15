
-- ══════════════════════════════════════════════════
-- 1. Feed Registry table
-- ══════════════════════════════════════════════════
CREATE TYPE public.feed_type AS ENUM ('rss', 'ical', 'auto');
CREATE TYPE public.source_category AS ENUM ('city', 'parks_rec', 'library', 'venue', 'other');
CREATE TYPE public.refresh_frequency AS ENUM ('hourly', 'daily');

CREATE TABLE public.feed_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feed_name TEXT NOT NULL,
  feed_url TEXT NOT NULL UNIQUE,
  feed_type public.feed_type NOT NULL DEFAULT 'auto',
  metro_area_slug TEXT NOT NULL,
  source_category public.source_category NOT NULL DEFAULT 'other',
  refresh_frequency public.refresh_frequency NOT NULL DEFAULT 'daily',
  enabled BOOLEAN NOT NULL DEFAULT true,
  default_venue_name TEXT,
  default_city TEXT,
  default_state TEXT DEFAULT 'NC',
  default_zip TEXT,
  last_fetched_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view feed registry"
  ON public.feed_registry FOR SELECT USING (true);

CREATE POLICY "Admins manage feed registry"
  ON public.feed_registry FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_feed_registry_updated_at
  BEFORE UPDATE ON public.feed_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ══════════════════════════════════════════════════
-- 2. Add image fields to canonical_events
-- ══════════════════════════════════════════════════
ALTER TABLE public.canonical_events
  ADD COLUMN IF NOT EXISTS image_source TEXT DEFAULT 'feed',
  ADD COLUMN IF NOT EXISTS image_attribution TEXT,
  ADD COLUMN IF NOT EXISTS image_last_verified_at TIMESTAMPTZ;

-- ══════════════════════════════════════════════════
-- 3. Add extracted_image_urls to source_events
-- ══════════════════════════════════════════════════
ALTER TABLE public.source_events
  ADD COLUMN IF NOT EXISTS extracted_image_urls JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS feed_id UUID REFERENCES public.feed_registry(id);

-- ══════════════════════════════════════════════════
-- 4. Index for feed processing
-- ══════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_feed_registry_enabled ON public.feed_registry(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_feed_registry_metro ON public.feed_registry(metro_area_slug);
CREATE INDEX IF NOT EXISTS idx_source_events_feed_id ON public.source_events(feed_id);
