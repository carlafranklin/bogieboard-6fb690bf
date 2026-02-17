
-- Create partner_profiles table
CREATE TABLE public.partner_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  business_name text NOT NULL,
  slug text NOT NULL UNIQUE,
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
  category_id uuid REFERENCES public.categories(id),
  subcategory_id uuid REFERENCES public.subcategories(id),
  logo_url text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view partner profiles" ON public.partner_profiles
  FOR SELECT USING (true);

CREATE POLICY "Partners can insert own profile" ON public.partner_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id AND has_role(auth.uid(), 'partner'));

CREATE POLICY "Partners can update own profile" ON public.partner_profiles
  FOR UPDATE USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete partner profiles" ON public.partner_profiles
  FOR DELETE USING (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_partner_profiles_updated_at
  BEFORE UPDATE ON public.partner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create partner_employees table
CREATE TABLE public.partner_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_profile_id uuid NOT NULL REFERENCES public.partner_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partners can view own employees" ON public.partner_employees
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.partner_profiles pp WHERE pp.id = partner_profile_id AND pp.user_id = auth.uid())
    OR has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Partners can insert own employees" ON public.partner_employees
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.partner_profiles pp WHERE pp.id = partner_profile_id AND pp.user_id = auth.uid())
  );

CREATE POLICY "Partners can update own employees" ON public.partner_employees
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.partner_profiles pp WHERE pp.id = partner_profile_id AND pp.user_id = auth.uid())
    OR has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Partners can delete own employees" ON public.partner_employees
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.partner_profiles pp WHERE pp.id = partner_profile_id AND pp.user_id = auth.uid())
    OR has_role(auth.uid(), 'admin')
  );

-- Create partner_events table
CREATE TABLE public.partner_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_profile_id uuid NOT NULL REFERENCES public.partner_profiles(id) ON DELETE CASCADE,
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
  category_id uuid REFERENCES public.categories(id),
  subcategory_id uuid REFERENCES public.subcategories(id),
  image_url text,
  ticket_url text,
  price numeric,
  is_free boolean DEFAULT false,
  age_restriction integer,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view partner events" ON public.partner_events
  FOR SELECT USING (true);

CREATE POLICY "Partners can insert own events" ON public.partner_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.partner_profiles pp WHERE pp.id = partner_profile_id AND pp.user_id = auth.uid())
  );

CREATE POLICY "Partners can update own events" ON public.partner_events
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.partner_profiles pp WHERE pp.id = partner_profile_id AND pp.user_id = auth.uid())
    OR has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Partners can delete own events" ON public.partner_events
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.partner_profiles pp WHERE pp.id = partner_profile_id AND pp.user_id = auth.uid())
    OR has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER update_partner_events_updated_at
  BEFORE UPDATE ON public.partner_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for partner logos
INSERT INTO storage.buckets (id, name, public) VALUES ('partner-logos', 'partner-logos', true);

CREATE POLICY "Anyone can view partner logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'partner-logos');

CREATE POLICY "Partners can upload own logos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'partner-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Partners can update own logos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'partner-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Partners can delete own logos" ON storage.objects
  FOR DELETE USING (bucket_id = 'partner-logos' AND auth.uid()::text = (storage.foldername(name))[1]);
