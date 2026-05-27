| tables_sql                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CREATE TABLE IF NOT EXISTS public.avatars (
  id uuid NOT NULL,
  avatar_name text NOT NULL,
  state_name text NOT NULL,
  animal_name text NOT NULL,
  image_url text,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.business_applications (
  id uuid NOT NULL,
  business_id uuid NOT NULL,
  submitted_by uuid NOT NULL,
  status partner_status NOT NULL,
  reviewer_id uuid,
  reviewed_at timestamp with time zone,
  review_notes text,
  submitted_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.business_locations (
  id uuid NOT NULL,
  business_id uuid NOT NULL,
  name text NOT NULL,
  is_primary boolean NOT NULL,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip_code text,
  country text NOT NULL,
  phone text,
  latitude double precision,
  longitude double precision,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  location geography(Point,4326)
);

CREATE TABLE IF NOT EXISTS public.business_members (
  id uuid NOT NULL,
  business_id uuid NOT NULL,
  user_id uuid,
  role business_member_role NOT NULL,
  contact_name text,
  contact_email text,
  contact_phone text,
  contact_title text,
  invited_by uuid,
  joined_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  category_id uuid,
  subcategory_id uuid,
  logo_url text,
  cover_url text,
  website text,
  social_facebook text,
  social_instagram text,
  social_twitter text,
  social_linkedin text,
  contact_name text,
  contact_email text,
  contact_phone text,
  verification_status partner_status NOT NULL,
  verified_by uuid,
  verified_at timestamp with time zone,
  review_notes text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.canonical_events (
  id uuid NOT NULL,
  title text NOT NULL,
  description_short text,
  description_long text,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone,
  all_day boolean NOT NULL,
  venue_id uuid,
  organizer_name text,
  age_restriction integer,
  price_min numeric,
  price_max numeric,
  currency text NOT NULL,
  is_free boolean NOT NULL,
  ticket_url text,
  image_url text,
  status event_status NOT NULL,
  metro_area_id uuid,
  normalized_hash text,
  event_series_id uuid,
  first_seen_at timestamp with time zone NOT NULL,
  last_seen_at timestamp with time zone NOT NULL,
  last_refreshed_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  image_source text,
  image_attribution text,
  image_last_verified_at timestamp with time zone,
  source_url text,
  discount_info text
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  display_order integer,
  created_at timestamp with time zone NOT NULL,
  parent_category_id uuid,
  icon text
);

CREATE TABLE IF NOT EXISTS public.city_lookup (
  id uuid NOT NULL,
  city_name text NOT NULL,
  state_code text NOT NULL,
  display_name text NOT NULL,
  zip_code text,
  latitude double precision,
  longitude double precision,
  country_code text NOT NULL,
  metro_area_id uuid,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.click_logs (
  id uuid NOT NULL,
  canonical_event_id uuid,
  source_id uuid,
  click_type text NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.event_categories (
  event_id uuid NOT NULL,
  category_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.event_series (
  id uuid NOT NULL,
  title text NOT NULL,
  rrule text,
  venue_id uuid,
  organizer_name text,
  metro_area_id uuid,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.events (
  id uuid NOT NULL,
  business_user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  event_date date,
  event_time text,
  venue text,
  city text,
  state text,
  zip_code text,
  category_id uuid,
  subcategory_id uuid,
  image_url text,
  price numeric,
  is_free boolean,
  age_restriction integer,
  ticket_url text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.feed_registry (
  id uuid NOT NULL,
  feed_name text NOT NULL,
  feed_url text NOT NULL,
  feed_type feed_type NOT NULL,
  metro_area_slug text NOT NULL,
  source_category source_category NOT NULL,
  refresh_frequency refresh_frequency NOT NULL,
  enabled boolean NOT NULL,
  default_venue_name text,
  default_city text,
  default_state text,
  default_zip text,
  last_fetched_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  scrape_interval_hours integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ingestion_errors (
  id uuid NOT NULL,
  ingestion_run_id uuid NOT NULL,
  event_source_url text,
  error_type text NOT NULL,
  message text,
  raw_payload jsonb,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ingestion_runs (
  id uuid NOT NULL,
  source_id uuid NOT NULL,
  started_at timestamp with time zone NOT NULL,
  ended_at timestamp with time zone,
  status ingestion_status NOT NULL,
  records_fetched integer,
  records_created integer,
  records_updated integer,
  records_skipped integer,
  errors_count integer,
  metadata jsonb
);

CREATE TABLE IF NOT EXISTS public.metro_areas (
  id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  core_cities jsonb NOT NULL,
  included_counties jsonb NOT NULL,
  included_zip_prefixes jsonb,
  created_at timestamp with time zone NOT NULL,
  latitude double precision,
  longitude double precision
);

CREATE TABLE IF NOT EXISTS public.partner_employees (
  id uuid NOT NULL,
  partner_profile_id uuid NOT NULL,
  name text NOT NULL,
  title text,
  phone text,
  email text,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.partner_events (
  id uuid NOT NULL,
  partner_profile_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  event_date date NOT NULL,
  event_time text,
  end_date date,
  end_time text,
  venue_name text,
  venue_address text,
  city text,
  state text,
  zip_code text,
  category_id uuid,
  subcategory_id uuid,
  image_url text,
  ticket_url text,
  price numeric,
  is_free boolean,
  age_restriction integer,
  status text NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  moderation_notes text,
  is_sponsored boolean NOT NULL,
  sponsored_type text,
  sponsored_start timestamp with time zone,
  sponsored_end timestamp with time zone,
  boost_score numeric NOT NULL,
  campaign_id uuid
);

CREATE TABLE IF NOT EXISTS public.partner_profiles (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  business_name text NOT NULL,
  slug text NOT NULL,
  address text,
  city text,
  state text,
  zip_code text,
  phone text,
  website text,
  social_facebook text,
  social_instagram text,
  social_twitter text,
  social_linkedin text,
  category_id uuid,
  subcategory_id uuid,
  logo_url text,
  description text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  cover_url text,
  verification_status text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  first_name text,
  last_name text,
  address text,
  email text,
  phone text,
  date_of_birth date,
  gender gender_type,
  marital_status text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  hometown text,
  favorite_cities jsonb,
  onboarding_completed boolean NOT NULL,
  onboarding_skipped boolean NOT NULL,
  provider text,
  provider_avatar_url text,
  custom_avatar_url text,
  selected_avatar_id uuid,
  interests jsonb,
  last_login_at timestamp with time zone,
  first_login_at timestamp with time zone,
  detected_city text,
  detected_state text,
  detected_zip text,
  current_city text,
  current_state text,
  current_zip text
);

CREATE TABLE IF NOT EXISTS public.saved_events (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  canonical_event_id uuid,
  event_id uuid,
  saved_at timestamp with time zone NOT NULL,
  notes text
);

CREATE TABLE IF NOT EXISTS public.search_logs (
  id uuid NOT NULL,
  searched_city_or_zip text,
  metro_area_id uuid,
  category_slug text,
  date_from date,
  date_to date,
  results_count integer,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.search_preferences (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  category_id uuid,
  subcategory_id uuid,
  city text,
  state text,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.source_events (
  id uuid NOT NULL,
  source_id uuid NOT NULL,
  external_event_id text,
  source_url text,
  raw_payload jsonb,
  normalized_hash text,
  parse_status parse_status NOT NULL,
  canonical_event_id uuid,
  fetched_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL,
  extracted_image_urls jsonb,
  feed_id uuid
);

CREATE TABLE IF NOT EXISTS public.sources (
  id uuid NOT NULL,
  name text NOT NULL,
  type source_type NOT NULL,
  base_url text,
  auth_method text,
  rate_limit_notes text,
  trust_score integer NOT NULL,
  metro_area_id uuid,
  config jsonb,
  is_active boolean NOT NULL,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.subcategories (
  id uuid NOT NULL,
  category_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamp with time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL
);

CREATE TABLE IF NOT EXISTS public.venues (
  id uuid NOT NULL,
  name text NOT NULL,
  address_1 text,
  address_2 text,
  city text,
  state text,
  zip text,
  county text,
  latitude double precision,
  longitude double precision,
  metro_area_id uuid,
  venue_url text,
  phone text,
  created_at timestamp with time zone NOT NULL,
  updated_at timestamp with time zone NOT NULL,
  location geography(Point,4326)
); |