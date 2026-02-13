
-- Add geospatial radius search function
-- Uses plpgsql with extensions in search_path for PostGIS types
CREATE OR REPLACE FUNCTION public.search_events_by_radius(
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_radius_meters DOUBLE PRECISION DEFAULT 40000,
  p_category_id UUID DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT now(),
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  event_id UUID, title TEXT, description_short TEXT,
  start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, all_day BOOLEAN,
  is_free BOOLEAN, price_min NUMERIC, price_max NUMERIC,
  ticket_url TEXT, image_url TEXT, age_restriction INTEGER,
  status public.event_status,
  venue_name TEXT, venue_city TEXT, venue_state TEXT, venue_zip TEXT,
  venue_lat DOUBLE PRECISION, venue_lon DOUBLE PRECISION,
  distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id, ce.title, ce.description_short, ce.start_time, ce.end_time, ce.all_day,
    ce.is_free, ce.price_min, ce.price_max, ce.ticket_url, ce.image_url, ce.age_restriction, ce.status,
    v.name, v.city, v.state, v.zip, v.latitude, v.longitude,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
    ) AS distance_meters
  FROM public.canonical_events ce
  JOIN public.venues v ON ce.venue_id = v.id
  LEFT JOIN public.event_categories ec ON ec.event_id = ce.id
  WHERE ce.status = 'active'
    AND ce.start_time >= p_date_from
    AND (p_date_to IS NULL OR ce.start_time <= p_date_to)
    AND (p_category_id IS NULL OR ec.category_id = p_category_id)
    AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
      p_radius_meters
    )
  ORDER BY distance_meters ASC, ce.start_time ASC
  LIMIT p_limit;
END;
$$;

-- Also create the venues location trigger using schema-qualified PostGIS
CREATE OR REPLACE FUNCTION public.venues_set_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Add the geography column to venues (was skipped to avoid type issues)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'venues' AND column_name = 'location'
  ) THEN
    EXECUTE 'ALTER TABLE public.venues ADD COLUMN location extensions.geography(Point, 4326)';
    EXECUTE 'CREATE INDEX idx_venues_location ON public.venues USING GIST(location)';
  END IF;
END $$;

-- Create trigger for auto-computing location
DROP TRIGGER IF EXISTS trg_venues_set_location ON public.venues;
CREATE TRIGGER trg_venues_set_location
  BEFORE INSERT OR UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.venues_set_location();
