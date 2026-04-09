
-- Create avatars table for state-animal avatar gallery
CREATE TABLE public.avatars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  avatar_name TEXT NOT NULL,
  state_name TEXT NOT NULL,
  animal_name TEXT NOT NULL,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view avatars"
ON public.avatars FOR SELECT
USING (true);

CREATE POLICY "Admins manage avatars"
ON public.avatars FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add avatar/social columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS custom_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS selected_avatar_id UUID REFERENCES public.avatars(id);

-- Create storage bucket for profile photos
INSERT INTO storage.buckets (id, name, public) VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view profile photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-photos');

CREATE POLICY "Users can upload own profile photo"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own profile photo"
ON storage.objects FOR UPDATE
USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own profile photo"
ON storage.objects FOR DELETE
USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
