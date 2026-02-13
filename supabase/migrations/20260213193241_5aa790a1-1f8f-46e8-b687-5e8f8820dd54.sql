
-- Create saved_events table for users to bookmark events
CREATE TABLE public.saved_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  canonical_event_id UUID REFERENCES public.canonical_events(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  saved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  CONSTRAINT saved_events_has_event CHECK (canonical_event_id IS NOT NULL OR event_id IS NOT NULL)
);

-- Index for fast lookups
CREATE INDEX idx_saved_events_user_id ON public.saved_events(user_id);
CREATE INDEX idx_saved_events_saved_at ON public.saved_events(saved_at DESC);

-- Unique constraint to prevent double-saving
CREATE UNIQUE INDEX idx_saved_events_unique_canonical ON public.saved_events(user_id, canonical_event_id) WHERE canonical_event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_saved_events_unique_event ON public.saved_events(user_id, event_id) WHERE event_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.saved_events ENABLE ROW LEVEL SECURITY;

-- Users can only see their own saved events
CREATE POLICY "Users can view own saved events"
ON public.saved_events FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can save events"
ON public.saved_events FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave events"
ON public.saved_events FOR DELETE
USING (auth.uid() = user_id);

-- Auto-cleanup: events older than 3 years (can be run via cron)
-- For now we'll handle this in application logic
