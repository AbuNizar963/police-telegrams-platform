-- Preserve organization-scoped outgoing serials assigned when a route is created.
-- If an older pending route has no local serial yet, allocate one for the approving authority.
CREATE OR REPLACE FUNCTION public.approve_telegram_route(
  p_route_id integer,
  p_approver_user_id integer,
  p_approved boolean,
  p_reason text DEFAULT NULL
)
RETURNS public.telegram_routes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  route_row public.telegram_routes%rowtype;
  telegram_row public.telegrams%rowtype;
  source_org public.organizations%rowtype;
  approver_org_id uuid;
  route_serial integer;
  route_serial_code varchar(48);
  settings_row public.department_settings%rowtype;
  reason_value text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  SELECT * INTO route_row
  FROM public.telegram_routes
  WHERE id = p_route_id
  FOR UPDATE;

  IF NOT FOUND OR route_row."approvalStatus" <> 'pending' THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'Route is not awaiting approval';
  END IF;

  SELECT * INTO telegram_row
  FROM public.telegrams
  WHERE id = route_row."telegramId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'Telegram not found';
  END IF;

  SELECT * INTO source_org
  FROM public.organizations
  WHERE id = route_row."fromOrganizationId";

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'Source organization not found';
  END IF;

  SELECT membership."organizationId"
    INTO approver_org_id
  FROM public.organization_memberships AS membership
  WHERE membership."userId" = p_approver_user_id
    AND membership."isActive" = true
    AND membership.role IN ('system_admin', 'organization_admin', 'reviewer')
    AND membership."organizationId" = source_org."parentOrganizationId"
  LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM public.users AS user_row
    WHERE user_row.id = p_approver_user_id AND user_row.role = 'admin'
  ) AND approver_org_id IS NULL THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Only the immediate higher authority may decide this route';
  END IF;

  IF NOT p_approved AND reason_value IS NULL THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'A reason is required when rejecting a route';
  END IF;

  IF p_approved AND route_row."routeSerialNumber" IS NULL THEN
    IF approver_org_id IS NULL THEN
      SELECT id INTO approver_org_id
      FROM public.organizations
      WHERE id = source_org."parentOrganizationId";
    END IF;

    SELECT * INTO settings_row
    FROM public.department_settings
    WHERE "organizationId" = approver_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Organization settings not found for approving authority';
    END IF;

    route_serial := settings_row."nextOutgoingSerial";
    route_serial_code := coalesce(nullif(settings_row."serialPrefix", ''), 'POL') || '-' ||
      to_char(now() AT TIME ZONE coalesce(nullif(settings_row."timezone", ''), 'Asia/Damascus'), 'YYYY-MM-DD') || '-' ||
      lpad(route_serial::text, 5, '0');

    UPDATE public.department_settings
    SET "nextOutgoingSerial" = route_serial + 1,
        "updatedAt" = now()
    WHERE id = settings_row.id;
  ELSE
    route_serial := route_row."routeSerialNumber";
    route_serial_code := route_row."routeSerialCode";
  END IF;

  UPDATE public.telegram_routes
  SET "approvalStatus" = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
      "approvedByUserId" = p_approver_user_id,
      "approvedAt" = now(),
      "approvalReason" = reason_value,
      "routeSerialNumber" = route_serial,
      "routeSerialCode" = route_serial_code
  WHERE id = p_route_id
  RETURNING * INTO route_row;

  IF p_approved THEN
    UPDATE public.telegrams
    SET "currentOrganizationId" = route_row."toOrganizationId",
        status = 'forwarded',
        "workflowReason" = coalesce(route_row.note, "workflowReason"),
        "updatedAt" = now()
    WHERE id = route_row."telegramId";

    INSERT INTO public.telegram_actions (
      "telegramId", "actorUserId", action, "fromStatus", "toStatus", reason, metadata
    ) VALUES (
      route_row."telegramId", p_approver_user_id, 'telegram.route.approved',
      telegram_row.status, 'forwarded', reason_value,
      jsonb_build_object(
        'routeId', route_row.id,
        'routeSerialCode', route_row."routeSerialCode",
        'approvedByUserId', p_approver_user_id,
        'fromOrganizationId', route_row."fromOrganizationId",
        'toOrganizationId', route_row."toOrganizationId"
      )::text
    );
  ELSE
    INSERT INTO public.telegram_actions (
      "telegramId", "actorUserId", action, "fromStatus", "toStatus", reason, metadata
    ) VALUES (
      route_row."telegramId", p_approver_user_id, 'telegram.route.rejected',
      telegram_row.status, telegram_row.status, reason_value,
      jsonb_build_object('routeId', route_row.id, 'rejectedByUserId', p_approver_user_id)::text
    );
  END IF;

  RETURN route_row;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_telegram_route(integer, integer, boolean, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_telegram_route(integer, integer, boolean, text)
  TO service_role;
