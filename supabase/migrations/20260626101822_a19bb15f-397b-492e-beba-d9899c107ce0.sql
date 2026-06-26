
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NULL,
  old_value jsonb NULL,
  new_value jsonb NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_log_action_check CHECK (
    action IN (
      'created','updated','activated','deactivated',
      'approved','rejected','status_changed',
      'role_granted','role_revoked'
    )
  ),
  CONSTRAINT admin_audit_log_entity_type_check CHECK (
    entity_type IN (
      'metro_area','partner_profile','partner_event',
      'feed_registry','user_role'
    )
  )
);

CREATE INDEX admin_audit_log_entity_idx
  ON public.admin_audit_log (entity_type, entity_id);
CREATE INDEX admin_audit_log_actor_created_idx
  ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX admin_audit_log_created_idx
  ON public.admin_audit_log (created_at DESC);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log"
  ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_audit_log_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log records are immutable';
END;
$$;

CREATE TRIGGER admin_audit_log_immutable
BEFORE UPDATE OR DELETE ON public.admin_audit_log
FOR EACH ROW EXECUTE FUNCTION public.admin_audit_log_block_mutation();

COMMENT ON TRIGGER admin_audit_log_immutable ON public.admin_audit_log IS
  'Blocks UPDATE/DELETE by normal application roles and accidental application mutation. Does not defend against database superusers or platform operators.';

CREATE OR REPLACE FUNCTION public.admin_log_action(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old_value jsonb,
  p_new_value jsonb,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.admin_audit_log (
    actor_id, action, entity_type, entity_id, old_value, new_value, reason
  ) VALUES (
    auth.uid(), p_action, p_entity_type, p_entity_id, p_old_value, p_new_value, p_reason
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_log_action(text, text, uuid, jsonb, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_log_action(text, text, uuid, jsonb, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_log_action(text, text, uuid, jsonb, jsonb, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.admin_log_action(text, text, uuid, jsonb, jsonb, text) FROM service_role;

COMMENT ON FUNCTION public.admin_log_action(text, text, uuid, jsonb, jsonb, text) IS
  'Internal audit helper. Not callable by application roles. Invoke only from future SECURITY DEFINER admin domain RPCs owned by the same database role so audit writes occur in the same transaction as the underlying admin action.';
