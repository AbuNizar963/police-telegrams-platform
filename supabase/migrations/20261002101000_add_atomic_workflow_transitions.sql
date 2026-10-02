-- Server-side state machine for telegram lifecycle transitions.
CREATE OR REPLACE FUNCTION public.transition_telegram(
  p_telegram_id integer,
  p_actor_user_id integer,
  p_to_status public.telegram_status,
  p_reason text DEFAULT NULL,
  p_metadata text DEFAULT NULL
)
RETURNS public.telegrams
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  telegram_row public.telegrams%rowtype;
  updated_row public.telegrams%rowtype;
  allowed boolean := false;
  reason_value text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  SELECT * INTO telegram_row FROM public.telegrams WHERE id = p_telegram_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Telegram not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m."organizationId" = telegram_row."currentOrganizationId"
      AND m."userId" = p_actor_user_id
      AND m."isActive" = true
      AND m.role IN ('system_admin', 'organization_admin', 'reviewer', 'dispatcher')
  ) THEN
    RAISE EXCEPTION 'User is not authorized for this telegram organization' USING ERRCODE = '42501';
  END IF;

  allowed :=
    (telegram_row.status = 'draft' AND p_to_status = 'submitted') OR
    (telegram_row.status = 'submitted' AND p_to_status = 'in_review') OR
    (telegram_row.status = 'in_review' AND p_to_status IN ('approved', 'returned', 'rejected')) OR
    (telegram_row.status = 'returned' AND p_to_status = 'submitted') OR
    (telegram_row.status = 'approved' AND p_to_status IN ('forwarded', 'completed')) OR
    (telegram_row.status = 'forwarded' AND p_to_status = 'completed') OR
    (telegram_row.status = 'pending' AND p_to_status IN ('in_progress', 'resolved', 'archived')) OR
    (telegram_row.status = 'in_progress' AND p_to_status IN ('resolved', 'completed', 'archived')) OR
    (telegram_row.status = 'resolved' AND p_to_status IN ('completed', 'archived'));

  IF NOT allowed THEN
    RAISE EXCEPTION 'Transition from % to % is not allowed', telegram_row.status, p_to_status USING ERRCODE = '22023';
  END IF;

  IF p_to_status IN ('returned', 'rejected') AND reason_value IS NULL THEN
    RAISE EXCEPTION 'A reason is required for returned or rejected telegrams' USING ERRCODE = '22023';
  END IF;

  UPDATE public.telegrams
     SET status = p_to_status,
         "workflowReason" = reason_value,
         "closedAt" = CASE WHEN p_to_status IN ('completed', 'archived', 'rejected') THEN now() ELSE NULL END,
         "archivedAt" = CASE WHEN p_to_status = 'archived' THEN now() ELSE "archivedAt" END,
         "updatedAt" = now()
   WHERE id = p_telegram_id
   RETURNING * INTO updated_row;

  INSERT INTO public.telegram_actions (
    "telegramId", "actorUserId", action, "fromStatus", "toStatus", reason, metadata
  ) VALUES (
    p_telegram_id, p_actor_user_id, 'status.transition', telegram_row.status, p_to_status, reason_value, p_metadata
  );

  RETURN updated_row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_telegram(integer, integer, public.telegram_status, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_telegram(integer, integer, public.telegram_status, text, text)
  TO service_role;
