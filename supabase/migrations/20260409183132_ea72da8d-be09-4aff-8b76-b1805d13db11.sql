
-- Drop the existing overly permissive INSERT policy
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;

-- Create a new admin-only INSERT policy
CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update handle_new_user to check metadata for partner signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  
  -- Check if user signed up as partner via metadata
  IF (NEW.raw_user_meta_data ->> 'is_partner')::boolean = true THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'partner');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'general');
  END IF;
  
  RETURN NEW;
END;
$$;
