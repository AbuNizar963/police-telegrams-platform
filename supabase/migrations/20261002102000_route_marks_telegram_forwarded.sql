-- Complete the central telegram handoff: routing changes both destination and lifecycle state.
CREATE OR REPLACE FUNCTION public.route_telegram(
  p_telegram_id integer,
  p_from_organization_id uuid,
  p_to_organization_id uuid,
  p_forwarded_by_user_id integer,
  p_note text DEFAULT NULL
)
RETURNS public.telegram_routes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  telegram_row public.telegrams%rowtype;
  source_org public.organizations%rowtype;
  target_org public.organizations%rowtype;
  route_row public.telegram_routes%rowtype;
BEGIN
  IF p_from_organization_id = p_to_organization_id THEN
    RAISE EXCEPTION 'Source and destination organizations must differ' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO telegram_row FROM public.telegrams WHERE id = p_telegram_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Telegram not found' USING ERRCODE = 'P0002';
  END IF;

  IF telegram_row."currentOrganizationId" <> p_from_organization_id THEN
    RAISE EXCEPTION 'Telegram is not currently assigned to the source organization' USING ERRCODE = '42501';
  END IF;

  IF telegram_row.status NOT IN ('approved', 'in_progress', 'forwarded') THEN
    RAISE EXCEPTION 'Telegram must be approved or in progress before routing' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO source_org FROM public.organizations
   WHERE id = p_from_organization_id AND "isActive" = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source organization is inactive or unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_org FROM public.organizations
   WHERE id = p_to_organization_id AND "isActive" = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destination organization is inactive or unavailable' USING ERRCODE = '42501';
  END IF;

  IF NOT (target_org."parentOrganizationId" = source_org.id OR source_org."parentOrganizationId" = target_org.id) THEN
    RAISE EXCEPTION 'Telegram routing is limited to directly connected organizations' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships membership
     WHERE membership."organizationId" = p_from_organization_id
       AND membership."userId" = p_forwarded_by_user_id
       AND membership."isActive" = true
       AND membership.role IN ('system_admin', 'organization_admin', 'dispatcher', 'reviewer')
  ) THEN
    RAISE EXCEPTION 'User is not authorized to route telegrams from this organization' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.telegram_routes (
    "telegramId", "fromOrganizationId", "toOrganizationId", "forwardedByUserId", status, note
  ) VALUES (
    p_telegram_id, p_from_organization_id, p_to_organization_id, p_forwarded_by_user_id, 'sent', nullif(trim(p_note), '')
  ) RETURNING * INTO route_row;

  UPDATE public.telegrams
     SET "currentOrganizationId" = p_to_organization_id,
         status = 'forwarded',
         "workflowReason" = nullif(trim(p_note), ''),
         "updatedAt" = now()
   WHERE id = p_telegram_id;

  INSERT INTO public.telegram_actions (
    "telegramId", "actorUserId", action, "fromStatus", "toStatus", reason, metadata
  ) VALUES (
    p_telegram_id, p_forwarded_by_user_id, 'telegram.route', telegram_row.status, 'forwarded',
    nullif(trim(p_note), ''), jsonb_build_object('toOrganizationId', p_to_organization_id)::text
  );

  RETURN route_row;
END;
$$;

REVOKE ALL ON FUNCTION public.route_telegram(integer, uuid, uuid, integer, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.route_telegram(integer, uuid, uuid, integer, text)
  TO service_role;
