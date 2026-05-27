| function_sql                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE OR REPLACE FUNCTION public.business_locations_set_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
      BEGIN
        IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
          BEGIN
            NEW.location := ST_SetSRID(
              ST_MakePoint(NEW.longitude, NEW.latitude),
              4326
            )::extensions.geography;
          EXCEPTION WHEN others THEN
            NULL;
          END;
        END IF;
        NEW.updated_at := now();
        RETURN NEW;
      END;
      $function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| CREATE OR REPLACE FUNCTION public.create_business_with_owner(p_name text, p_slug text, p_description text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_contact_name text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_address_line1 text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_zip_code text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_member_title text DEFAULT 'Owner'::text)
 RETURNS TABLE(out_business_id uuid, out_slug text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller_id   UUID;
  _business_id UUID;
  _slug        TEXT;
BEGIN
  -- ── Identify the authenticated caller ─────────────────────────────────────
  _caller_id := auth.uid();
  IF _caller_id IS NULL THEN
    RAISE EXCEPTION 'create_business_with_owner: caller is not authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  -- ── Validate required inputs ──────────────────────────────────────────────
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'create_business_with_owner: p_name is required'
      USING ERRCODE = 'P0001';
  END IF;
  IF p_slug IS NULL OR trim(p_slug) = '' THEN
    RAISE EXCEPTION 'create_business_with_owner: p_slug is required'
      USING ERRCODE = 'P0001';
  END IF;

  _slug := lower(trim(p_slug));

  -- ── Step 1: Insert businesses ─────────────────────────────────────────────
  BEGIN
    INSERT INTO public.businesses (
      name,
      slug,
      description,
      category_id,
      subcategory_id,
      contact_name,
      contact_email,
      contact_phone,
      verification_status
    )
    VALUES (
      trim(p_name),
      _slug,
      NULLIF(trim(COALESCE(p_description,   '')), ''),
      p_category_id,
      p_subcategory_id,
      NULLIF(trim(COALESCE(p_contact_name,  '')), ''),
      NULLIF(trim(COALESCE(p_contact_email, '')), ''),
      NULLIF(trim(COALESCE(p_contact_phone, '')), ''),
      'pending'   -- all new businesses begin as pending admin review
    )
    RETURNING id INTO _business_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION
      'A business with the slug "%" already exists. '
      'Please try a slightly different business name.',
      _slug
      USING ERRCODE = 'P0003';
  END;

  -- ── Step 2: Insert business_members (owner row) ───────────────────────────
  -- trg_business_member_insert fires here and inserts 'partner' into
  -- user_roles for _caller_id via ON CONFLICT DO NOTHING.
  -- The partner role is granted inside this same transaction.
  INSERT INTO public.business_members (
    business_id,
    user_id,
    role,
    contact_name,
    contact_email,
    contact_phone,
    contact_title
  )
  VALUES (
    _business_id,
    _caller_id,
    'owner',
    NULLIF(trim(COALESCE(p_contact_name,  '')), ''),
    NULLIF(trim(COALESCE(p_contact_email, '')), ''),
    NULLIF(trim(COALESCE(p_contact_phone, '')), ''),
    NULLIF(trim(COALESCE(p_member_title,  '')), 'Owner')
  );

  -- ── Step 3: Insert business_locations (primary location) ─────────────────
  INSERT INTO public.business_locations (
    business_id,
    name,
    is_primary,
    address_line1,
    city,
    state,
    zip_code,
    phone
  )
  VALUES (
    _business_id,
    'Primary Location',
    true,
    NULLIF(trim(COALESCE(p_address_line1, '')), ''),
    NULLIF(trim(COALESCE(p_city,          '')), ''),
    NULLIF(trim(COALESCE(p_state,         '')), ''),
    NULLIF(trim(COALESCE(p_zip_code,      '')), ''),
    NULLIF(trim(COALESCE(p_phone,         '')), '')
  );

  -- ── Step 4: Insert business_applications (pending review) ────────────────
  INSERT INTO public.business_applications (
    business_id,
    submitted_by,
    status
  )
  VALUES (
    _business_id,
    _caller_id,
    'pending'
  );

  -- ── Return identifiers for frontend navigation ────────────────────────────
  RETURN QUERY SELECT _business_id, _slug;
END;
$function$
 |
| CREATE OR REPLACE FUNCTION public.generate_event_hash(p_title text, p_start_time timestamp with time zone, p_city text, p_venue_name text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT md5(
    lower(trim(regexp_replace(p_title, '[^a-zA-Z0-9 ]', '', 'g')))
    || '|' || to_char(p_start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
    || '|' || lower(trim(COALESCE(p_city, '')))
    || '|' || lower(trim(COALESCE(p_venue_name, '')))
  );
$function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| CREATE OR REPLACE FUNCTION public.handle_business_member_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Grant partner role only when a real platform user (user_id IS NOT NULL)
  -- becomes an owner. External contacts (user_id NULL) get no role.
  IF NEW.role = 'owner' AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'partner')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _first_name TEXT;
  _last_name  TEXT;
  _full_name  TEXT;
BEGIN
  -- ── Resolve full_name once for reuse ──────────────────────────────────────
  _full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    ''
  );

  -- ── Extract first name ────────────────────────────────────────────────────
  -- Priority: explicit first_name field → first word of full_name/name →
  --           given_name (Google OAuth)
  _first_name := NULLIF(trim(COALESCE(
    NEW.raw_user_meta_data ->> 'first_name',
    CASE
      WHEN _full_name <> '' THEN split_part(_full_name, ' ', 1)
      ELSE NULL
    END,
    NEW.raw_user_meta_data ->> 'given_name'
  )), '');

  -- ── Extract last name ─────────────────────────────────────────────────────
  -- Priority: explicit last_name field → everything after first space in
  --           full_name/name → family_name (Google OAuth)
  _last_name := NULLIF(trim(COALESCE(
    NEW.raw_user_meta_data ->> 'last_name',
    CASE
      WHEN _full_name <> '' AND position(' ' IN _full_name) > 0
        THEN substr(_full_name, position(' ' IN _full_name) + 1)
      ELSE NULL
    END,
    NEW.raw_user_meta_data ->> 'family_name'
  )), '');

  -- ── Create profile row ────────────────────────────────────────────────────
  -- ON CONFLICT DO NOTHING: safe if trigger fires more than once.
  INSERT INTO public.profiles (user_id, email, first_name, last_name)
  VALUES (NEW.id, NEW.email, _first_name, _last_name)
  ON CONFLICT (user_id) DO NOTHING;

  -- ── Assign role: always 'general' ────────────────────────────────────────
  -- 'partner' role is granted only by trg_business_member_insert after the
  -- user creates a business and is inserted as owner in business_members.
  -- This function never assigns 'partner', regardless of metadata content.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'general')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| CREATE OR REPLACE FUNCTION public.is_business_member(_business_id uuid, _min_role business_member_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM   public.business_members bm
    WHERE  bm.business_id = _business_id
    AND    bm.user_id     = auth.uid()
    AND    CASE _min_role
             WHEN 'staff' THEN bm.role IN ('staff', 'admin', 'owner')
             WHEN 'admin' THEN bm.role IN ('admin', 'owner')
             WHEN 'owner' THEN bm.role =  'owner'
           END
  );
$function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CREATE OR REPLACE FUNCTION public.map_to_app_category(p_source_category text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Live Music
    WHEN lower(p_source_category) ~ '(music|concert|band|singer|guitarist|dj|hip-hop|rap|jazz|blues|country|folk|classical|latin|r&b|rock|pop|reggae|metal|punk|indie|soul|gospel|ballad)' THEN 'live-music'
    -- Festivals
    WHEN lower(p_source_category) ~ '(festival|fair|carnival|holi|mardi|fiesta|celebration|jubilee)' THEN 'festivals'
    -- Business
    WHEN lower(p_source_category) ~ '(business|networking|conference|startup|entrepreneur|professional|corporate|trade show|expo|summit)' THEN 'business'
    -- Bar Fun
    WHEN lower(p_source_category) ~ '(bar|nightlife|club|pub|brewery|trivia|karaoke|happy hour|cocktail|wine tasting|beer)' THEN 'bar-fun'
    -- Shopping
    WHEN lower(p_source_category) ~ '(shopping|market|craft fair|flea market|antique|bazaar|sale|vendor|pop-up shop)' THEN 'shopping'
    -- Family & Kids
    WHEN lower(p_source_category) ~ '(family|kids|children|youth|teen|toddler|baby|parenting|storytime|puppet|camp|easter|halloween)' THEN 'family-kids'
    -- Movies
    WHEN lower(p_source_category) ~ '(movie|film|cinema|screening|documentary|animation|drive-in)' THEN 'movies'
    -- Religious & Spiritual
    WHEN lower(p_source_category) ~ '(religious|spiritual|church|worship|faith|prayer|bible|meditation|yoga|mindfulness|retreat|temple|mosque|synagogue)' THEN 'religious-spiritual'
    -- Sports & Games
    WHEN lower(p_source_category) ~ '(sport|game|basketball|football|soccer|baseball|hockey|tennis|golf|racing|marathon|run|walk|fitness|workout|gym|athletic|curling|swimming|aquatic|boxing|wrestling|mma|volleyball)' THEN 'sports-games'
    -- Lecture Series
    WHEN lower(p_source_category) ~ '(lecture|seminar|workshop|class|education|learning|talk|panel|webinar|symposium|course|training|book|reading|author|literary)' THEN 'lecture-series'
    -- Political Events
    WHEN lower(p_source_category) ~ '(political|politics|election|campaign|rally|protest|march|civic|government|town hall|debate|advocacy|activist)' THEN 'political-events'
    -- Arts & Theater
    WHEN lower(p_source_category) ~ '(art|theater|theatre|gallery|museum|exhibit|dance|ballet|opera|play|drama|musical|performance|comedy|standup|stand-up|improv|craft|painting|sculpture|photography)' THEN 'arts-theater'
    -- Default
    ELSE NULL
  END;
$function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| CREATE OR REPLACE FUNCTION public.record_login(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Belt-and-suspenders guard: the RLS policy already enforces this,
  -- but an explicit check gives a clear error message in logs.
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION
      'record_login: caller may only record their own login (got % expected %)',
      auth.uid(), p_user_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles
  SET
    last_login_at  = now(),
    first_login_at = COALESCE(first_login_at, now())
  WHERE user_id = p_user_id;
END;
$function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| CREATE OR REPLACE FUNCTION public.search_events(p_metro_slug text DEFAULT NULL::text, p_category_slug text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT now(), p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(event_id uuid, title text, description_short text, start_time timestamp with time zone, end_time timestamp with time zone, all_day boolean, is_free boolean, price_min numeric, price_max numeric, ticket_url text, image_url text, age_restriction integer, status event_status, venue_name text, venue_address text, venue_city text, venue_state text, venue_zip text, venue_lat double precision, venue_lon double precision, metro_name text, category_names text[], source_url text, discount_info text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
$function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| CREATE OR REPLACE FUNCTION public.search_events_by_radius(p_lat double precision, p_lon double precision, p_radius_meters double precision DEFAULT 40000, p_category_id uuid DEFAULT NULL::uuid, p_date_from timestamp with time zone DEFAULT now(), p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50)
 RETURNS TABLE(event_id uuid, title text, description_short text, start_time timestamp with time zone, end_time timestamp with time zone, all_day boolean, is_free boolean, price_min numeric, price_max numeric, ticket_url text, image_url text, age_restriction integer, status event_status, venue_name text, venue_city text, venue_state text, venue_zip text, venue_lat double precision, venue_lon double precision, distance_meters double precision)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| CREATE OR REPLACE FUNCTION public.venues_set_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |