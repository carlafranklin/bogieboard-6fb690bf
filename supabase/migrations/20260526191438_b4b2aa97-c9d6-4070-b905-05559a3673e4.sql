CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_first_name text := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'first_name'), '');
  v_last_name  text := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'last_name'), '');
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name)
  VALUES (NEW.id, NEW.email, v_first_name, v_last_name);

  IF (NEW.raw_user_meta_data ->> 'is_partner')::boolean = true THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'partner');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'general');
  END IF;

  RETURN NEW;
END;
$function$;