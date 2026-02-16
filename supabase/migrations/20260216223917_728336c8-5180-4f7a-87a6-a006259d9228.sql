
-- Add scrape interval column (in hours) to feed_registry
ALTER TABLE public.feed_registry 
ADD COLUMN scrape_interval_hours integer NOT NULL DEFAULT 12;

-- Set sensible defaults based on existing refresh_frequency
UPDATE public.feed_registry SET scrape_interval_hours = 1 WHERE refresh_frequency = 'hourly';
UPDATE public.feed_registry SET scrape_interval_hours = 24 WHERE refresh_frequency = 'daily';
