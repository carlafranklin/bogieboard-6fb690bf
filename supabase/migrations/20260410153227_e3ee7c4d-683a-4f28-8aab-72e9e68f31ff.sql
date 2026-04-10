
-- 1. Add location tracking fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS detected_city text,
  ADD COLUMN IF NOT EXISTS detected_state text,
  ADD COLUMN IF NOT EXISTS detected_zip text,
  ADD COLUMN IF NOT EXISTS current_city text,
  ADD COLUMN IF NOT EXISTS current_state text,
  ADD COLUMN IF NOT EXISTS current_zip text;

-- 2. Add lat/lng to metro_areas
ALTER TABLE public.metro_areas
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- Set coordinates for pilot metros
UPDATE public.metro_areas SET latitude = 35.2271, longitude = -80.8431 WHERE slug = 'charlotte-nc';
UPDATE public.metro_areas SET latitude = 36.0726, longitude = -79.7920 WHERE slug = 'greensboro-nc';
UPDATE public.metro_areas SET latitude = 35.7796, longitude = -78.6382 WHERE slug = 'raleigh-durham-nc';

-- 3. Create city_lookup table
CREATE TABLE IF NOT EXISTS public.city_lookup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name text NOT NULL,
  state_code text NOT NULL DEFAULT 'NC',
  display_name text NOT NULL,
  zip_code text,
  latitude double precision,
  longitude double precision,
  country_code text NOT NULL DEFAULT 'US',
  metro_area_id uuid REFERENCES public.metro_areas(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.city_lookup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view city lookup"
  ON public.city_lookup FOR SELECT USING (true);

-- Indexes for search performance
CREATE INDEX IF NOT EXISTS idx_city_lookup_city_lower ON public.city_lookup (lower(city_name));
CREATE INDEX IF NOT EXISTS idx_city_lookup_zip ON public.city_lookup (zip_code);
CREATE INDEX IF NOT EXISTS idx_city_lookup_state ON public.city_lookup (state_code);

-- 4. Seed NC cities
-- We need metro_area IDs. Use a DO block to look them up.
DO $$
DECLARE
  v_charlotte_id uuid;
  v_greensboro_id uuid;
  v_raleigh_id uuid;
BEGIN
  SELECT id INTO v_charlotte_id FROM public.metro_areas WHERE slug = 'charlotte-nc';
  SELECT id INTO v_greensboro_id FROM public.metro_areas WHERE slug = 'greensboro-nc';
  SELECT id INTO v_raleigh_id FROM public.metro_areas WHERE slug = 'raleigh-durham-nc';

  -- Charlotte Metro
  INSERT INTO public.city_lookup (city_name, state_code, display_name, zip_code, latitude, longitude, metro_area_id) VALUES
    ('Charlotte', 'NC', 'Charlotte, NC', '28202', 35.2271, -80.8431, v_charlotte_id),
    ('Gastonia', 'NC', 'Gastonia, NC', '28052', 35.2621, -81.1873, v_charlotte_id),
    ('Concord', 'NC', 'Concord, NC', '28025', 35.4088, -80.5795, v_charlotte_id),
    ('Huntersville', 'NC', 'Huntersville, NC', '28078', 35.4107, -80.8429, v_charlotte_id),
    ('Kannapolis', 'NC', 'Kannapolis, NC', '28081', 35.4874, -80.6217, v_charlotte_id),
    ('Matthews', 'NC', 'Matthews, NC', '28105', 35.1168, -80.7237, v_charlotte_id),
    ('Monroe', 'NC', 'Monroe, NC', '28110', 34.9854, -80.5495, v_charlotte_id),
    ('Mooresville', 'NC', 'Mooresville, NC', '28115', 35.5849, -80.8101, v_charlotte_id),
    ('Salisbury', 'NC', 'Salisbury, NC', '28144', 35.6710, -80.4742, v_charlotte_id),
    ('Shelby', 'NC', 'Shelby, NC', '28150', 35.2924, -81.5356, v_charlotte_id),
    ('Statesville', 'NC', 'Statesville, NC', '28677', 35.7826, -80.8873, v_charlotte_id),
    ('Belmont', 'NC', 'Belmont, NC', '28012', 35.2429, -81.0376, v_charlotte_id),
    ('Cornelius', 'NC', 'Cornelius, NC', '28031', 35.4868, -80.8601, v_charlotte_id),
    ('Davidson', 'NC', 'Davidson, NC', '28036', 35.4993, -80.8487, v_charlotte_id),
    ('Indian Trail', 'NC', 'Indian Trail, NC', '28079', 35.0771, -80.6693, v_charlotte_id),
    ('Mint Hill', 'NC', 'Mint Hill, NC', '28227', 35.1796, -80.6462, v_charlotte_id),
    ('Pineville', 'NC', 'Pineville, NC', '28134', 35.0832, -80.8923, v_charlotte_id),
    ('Waxhaw', 'NC', 'Waxhaw, NC', '28173', 34.9246, -80.7434, v_charlotte_id),
    ('Rock Hill', 'SC', 'Rock Hill, SC', '29730', 34.9249, -81.0251, v_charlotte_id),
    ('Fort Mill', 'SC', 'Fort Mill, SC', '29708', 35.0074, -80.9451, v_charlotte_id),

  -- Greensboro Metro
    ('Greensboro', 'NC', 'Greensboro, NC', '27401', 36.0726, -79.7920, v_greensboro_id),
    ('High Point', 'NC', 'High Point, NC', '27260', 35.9557, -80.0053, v_greensboro_id),
    ('Asheboro', 'NC', 'Asheboro, NC', '27203', 35.7079, -79.8136, v_greensboro_id),
    ('Jamestown', 'NC', 'Jamestown, NC', '27282', 35.9924, -79.9353, v_greensboro_id),
    ('Oak Ridge', 'NC', 'Oak Ridge, NC', '27310', 36.1735, -79.9889, v_greensboro_id),
    ('Pleasant Garden', 'NC', 'Pleasant Garden, NC', '27313', 35.9624, -79.7614, v_greensboro_id),
    ('Summerfield', 'NC', 'Summerfield, NC', '27358', 36.2071, -79.9042, v_greensboro_id),
    ('Randleman', 'NC', 'Randleman, NC', '27317', 35.8185, -79.8028, v_greensboro_id),
    ('Reidsville', 'NC', 'Reidsville, NC', '27320', 36.3535, -79.6623, v_greensboro_id),
    ('Burlington', 'NC', 'Burlington, NC', '27215', 36.0957, -79.4378, v_greensboro_id),
    ('Kernersville', 'NC', 'Kernersville, NC', '27284', 36.1197, -80.0737, v_greensboro_id),

  -- Raleigh/Durham Metro
    ('Raleigh', 'NC', 'Raleigh, NC', '27601', 35.7796, -78.6382, v_raleigh_id),
    ('Durham', 'NC', 'Durham, NC', '27701', 35.9940, -78.8986, v_raleigh_id),
    ('Chapel Hill', 'NC', 'Chapel Hill, NC', '27514', 35.9132, -79.0558, v_raleigh_id),
    ('Cary', 'NC', 'Cary, NC', '27511', 35.7915, -78.7811, v_raleigh_id),
    ('Apex', 'NC', 'Apex, NC', '27502', 35.7327, -78.8503, v_raleigh_id),
    ('Morrisville', 'NC', 'Morrisville, NC', '27560', 35.8235, -78.8256, v_raleigh_id),
    ('Wake Forest', 'NC', 'Wake Forest, NC', '27587', 35.9799, -78.5097, v_raleigh_id),
    ('Holly Springs', 'NC', 'Holly Springs, NC', '27540', 35.6513, -78.8336, v_raleigh_id),
    ('Fuquay-Varina', 'NC', 'Fuquay-Varina, NC', '27526', 35.5843, -78.8000, v_raleigh_id),
    ('Garner', 'NC', 'Garner, NC', '27529', 35.7113, -78.6142, v_raleigh_id),
    ('Knightdale', 'NC', 'Knightdale, NC', '27545', 35.7885, -78.4797, v_raleigh_id),
    ('Carrboro', 'NC', 'Carrboro, NC', '27510', 35.9102, -79.0753, v_raleigh_id),
    ('Hillsborough', 'NC', 'Hillsborough, NC', '27278', 36.0754, -79.0920, v_raleigh_id),
    ('Sanford', 'NC', 'Sanford, NC', '27330', 35.4799, -79.1803, v_raleigh_id),
    ('Smithfield', 'NC', 'Smithfield, NC', '27577', 35.5085, -78.3394, v_raleigh_id),

  -- Other major NC cities (no metro assignment yet)
    ('Winston-Salem', 'NC', 'Winston-Salem, NC', '27101', 36.0999, -80.2442, NULL),
    ('Fayetteville', 'NC', 'Fayetteville, NC', '28301', 35.0527, -78.8784, NULL),
    ('Wilmington', 'NC', 'Wilmington, NC', '28401', 34.2257, -77.9447, NULL),
    ('Asheville', 'NC', 'Asheville, NC', '28801', 35.5951, -82.5515, NULL),
    ('Greenville', 'NC', 'Greenville, NC', '27834', 35.6127, -77.3664, NULL),
    ('Jacksonville', 'NC', 'Jacksonville, NC', '28540', 34.7541, -77.4302, NULL),
    ('New Bern', 'NC', 'New Bern, NC', '28560', 35.1085, -77.0441, NULL),
    ('Hickory', 'NC', 'Hickory, NC', '28601', 35.7334, -81.3412, NULL),
    ('Rocky Mount', 'NC', 'Rocky Mount, NC', '27801', 35.9382, -77.7905, NULL),
    ('Goldsboro', 'NC', 'Goldsboro, NC', '27530', 35.3849, -77.9928, NULL),
    ('Lumberton', 'NC', 'Lumberton, NC', '28358', 34.6182, -79.0087, NULL),
    ('Sandhills', 'NC', 'Southern Pines, NC', '28387', 35.1741, -79.3923, NULL),
    ('Boone', 'NC', 'Boone, NC', '28607', 36.2168, -81.6746, NULL),
    ('Outer Banks', 'NC', 'Kill Devil Hills, NC', '27948', 36.0307, -75.6760, NULL),
    ('Elizabeth City', 'NC', 'Elizabeth City, NC', '27909', 36.2946, -76.2511, NULL),
    ('Hendersonville', 'NC', 'Hendersonville, NC', '28739', 35.3187, -82.4612, NULL),
    ('Morganton', 'NC', 'Morganton, NC', '28655', 35.7454, -81.6848, NULL),
    ('Kinston', 'NC', 'Kinston, NC', '28501', 35.2627, -77.5816, NULL),
    ('Thomasville', 'NC', 'Thomasville, NC', '27360', 35.8827, -80.0820, v_greensboro_id),
    ('Lexington', 'NC', 'Lexington, NC', '27292', 35.8240, -80.2534, v_greensboro_id);
END $$;
