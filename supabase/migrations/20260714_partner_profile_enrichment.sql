-- Partner profile enrichment (Phase 1 MVP)
-- Additive only. No NOT NULL constraints, no new enums, no RLS changes.
-- These are static business-profile attributes, not survey answers — a future
-- partner_survey_responses table (question_key/version/answer, jsonb) is the
-- recommended shape for open-ended, re-askable, versioned questions later;
-- not built here.

ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS primary_contact_name  text,
  ADD COLUMN IF NOT EXISTS primary_contact_email text,
  ADD COLUMN IF NOT EXISTS primary_contact_phone text,
  ADD COLUMN IF NOT EXISTS industry_sector       text,
  ADD COLUMN IF NOT EXISTS industry_type         text,
  ADD COLUMN IF NOT EXISTS social_tiktok         text,
  ADD COLUMN IF NOT EXISTS year_established      integer,
  ADD COLUMN IF NOT EXISTS employee_count_range  text,
  ADD COLUMN IF NOT EXISTS business_hours        text,
  ADD COLUMN IF NOT EXISTS primary_customer_audience       text[],
  ADD COLUMN IF NOT EXISTS primary_customer_audience_other text,
  ADD COLUMN IF NOT EXISTS primary_marketing_goal          text[],
  ADD COLUMN IF NOT EXISTS primary_marketing_goal_other    text,
  ADD COLUMN IF NOT EXISTS interested_in_promotions        boolean;
