
-- Step 1: Drop existing function
DROP FUNCTION IF EXISTS public.search_events(text, text, timestamptz, timestamptz, integer, integer);

-- Step 2: Add new columns
ALTER TABLE public.canonical_events
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS discount_info text;

-- Step 3: Recreate function with new return type
CREATE FUNCTION public.search_events(
  p_metro_slug text DEFAULT NULL,
  p_category_slug text DEFAULT NULL,
  p_date_from timestamptz DEFAULT now(),
  p_date_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  event_id uuid, title text, description_short text,
  start_time timestamptz, end_time timestamptz, all_day boolean,
  is_free boolean, price_min numeric, price_max numeric,
  ticket_url text, image_url text, age_restriction integer,
  status event_status,
  venue_name text, venue_address text, venue_city text, venue_state text, venue_zip text,
  venue_lat double precision, venue_lon double precision,
  metro_name text, category_names text[],
  source_url text, discount_info text
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT
    ce.id, ce.title, ce.description_short, ce.start_time, ce.end_time, ce.all_day,
    ce.is_free, ce.price_min, ce.price_max, ce.ticket_url, ce.image_url, ce.age_restriction, ce.status,
    v.name, v.address_1, v.city, v.state, v.zip, v.latitude, v.longitude,
    ma.name,
    ARRAY(SELECT c.name FROM public.categories c JOIN public.event_categories ec2 ON ec2.category_id = c.id WHERE ec2.event_id = ce.id),
    ce.source_url, ce.discount_info
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
