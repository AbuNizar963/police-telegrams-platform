-- Direct legacy routes may have no authority approval requirement but still
-- remain pending receipt confirmation by the destination organization.
CREATE OR REPLACE FUNCTION public.decide_telegram_route_receiver(
  p_route_id integer,
  p_receiver_user_id integer,
  p_accepted boolean,
  p_reason text DEFAULT NULL
)
RETURNS public.telegram_routes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  route_row public.telegram_routes%rowtype;
  receiver_org_id uuid;
  reason_value text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  SELECT * INTO route_row
  FROM public.telegram_routes
  WHERE id = p_route_id
  FOR UPDATE;

  IF NOT FOUND OR route_row."approvalStatus" NOT IN ('approved', 'not_required')
     OR route_row."receiverDecisionStatus" <> 'pending'
     OR route_row.status <> 'sent' THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Route is not awaiting receiver decision';
  END IF;

  SELECT "organizationId" INTO receiver_org_id
  FROM public.organization_memberships
  WHERE "userId" = p_receiver_user_id
    AND "isActive" = true
    AND role IN ('system_admin', 'organization_admin', 'dispatcher', 'reviewer')
    AND "organizationId" = route_row."toOrganizationId"
  LIMIT 1;

  IF receiver_org_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = p_receiver_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'Only the receiving organization may decide this route';
  END IF;

  IF NOT p_accepted AND reason_value IS NULL THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'A reason is required when rejecting receipt';
  END IF;

  UPDATE public.telegram_routes
  SET "receiverDecisionStatus" = CASE WHEN p_accepted THEN 'accepted' ELSE 'rejected' END,
      "receiverDecisionByUserId" = p_receiver_user_id,
      "receiverDecisionAt" = now(),
      "receiverDecisionReason" = reason_value,
      status = CASE WHEN p_accepted THEN 'received' ELSE 'rejected' END,
      "receivedAt" = CASE WHEN p_accepted THEN now() ELSE NULL END
  WHERE id = p_route_id
  RETURNING * INTO route_row;

  INSERT INTO public.telegram_actions (
    "telegramId", "actorUserId", action, reason, metadata
  ) VALUES (
    route_row."telegramId",
    p_receiver_user_id,
    CASE WHEN p_accepted THEN 'telegram.route.receiver_accept' ELSE 'telegram.route.receiver_reject' END,
    reason_value,
    jsonb_build_object(
      'routeId', route_row.id,
      'receiverDecisionStatus', route_row."receiverDecisionStatus",
      'receiverDecisionByUserId', p_receiver_user_id
    )::text
  );

  RETURN route_row;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_telegram_route_receiver(integer, integer, boolean, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_telegram_route_receiver(integer, integer, boolean, text)
  TO service_role;
