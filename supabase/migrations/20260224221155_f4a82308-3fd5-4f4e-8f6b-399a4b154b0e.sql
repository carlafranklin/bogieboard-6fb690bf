
-- Add missing columns to partner_profiles for business marketplace
ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';

-- Add missing columns to partner_events for status workflow + promotions
ALTER TABLE public.partner_events
  ADD COLUMN IF NOT EXISTS moderation_notes text,
  ADD COLUMN IF NOT EXISTS is_sponsored boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sponsored_type text,
  ADD COLUMN IF NOT EXISTS sponsored_start timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sponsored_end timestamp with time zone,
  ADD COLUMN IF NOT EXISTS boost_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS campaign_id uuid;

-- Update existing events to use proper status values (currently 'active')
-- Map 'active' to 'approved' for the new workflow
UPDATE public.partner_events SET status = 'approved' WHERE status = 'active';
