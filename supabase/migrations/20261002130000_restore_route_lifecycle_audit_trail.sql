-- Restore the lifecycle, authorization, and audit guarantees that were lost
-- when the hierarchy approval function replaced the earlier route function.
-- Every route decision is applied atomically with the telegram state and action log.

CREATE INDEX IF NOT EXISTS department_settings_updated_by_user_idx
  ON public.department_settings ("updatedByUserId")
  WHERE "updatedByUserId" IS NOT NULL;

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
  source_governorate uuid;
  target_governorate uuid;
  requires_approval boolean := false;
  note_value text := nullif(trim(coalesce(p_note, '')), '');
BEGIN
  IF p_from_organization_id = p_to_organization_id THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'Source and destination organizations must differ';
  END IF;

  SELECT * INTO telegram_row
  FROM public.telegrams
  WHERE id = p_telegram_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'Telegram not found';
  END IF;

  IF telegram_row."currentOrganizationId" <> p_from_organization_id THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Telegram is not currently assigned to the source organization';
  END IF;

  IF telegram_row.status NOT IN ('approved', 'in_progress', 'forwarded') THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'Telegram must be approved or in progress before routing';
  END IF;

  SELECT * INTO source_org
  FROM public.organizations
  WHERE id = p_from_organization_id
    AND "isActive" = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Source organization is inactive or unavailable';
  END IF;

  SELECT * INTO target_org
  FROM public.organizations
  WHERE id = p_to_organization_id
    AND "isActive" = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Destination organization is inactive or unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships AS membership
    WHERE membership."organizationId" = p_from_organization_id
      AND membership."userId" = p_forwarded_by_user_id
      AND membership."isActive" = true
      AND membership.role IN (
        'system_admin',
        'organization_admin',
        'dispatcher',
        'reviewer'
      )
  ) THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'User is not authorized to route telegrams from this organization';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT id, "parentOrganizationId", type
    FROM public.organizations
    WHERE id = source_org.id

    UNION ALL

    SELECT parent.id, parent."parentOrganizationId", parent.type
    FROM public.organizations AS parent
    JOIN ancestors AS child ON parent.id = child."parentOrganizationId"
  )
  SELECT id INTO source_governorate
  FROM ancestors
  WHERE type = 'governorate'
  LIMIT 1;

  WITH RECURSIVE ancestors AS (
    SELECT id, "parentOrganizationId", type
    FROM public.organizations
    WHERE id = target_org.id

    UNION ALL

    SELECT parent.id, parent."parentOrganizationId", parent.type
    FROM public.organizations AS parent
    JOIN ancestors AS child ON parent.id = child."parentOrganizationId"
  )
  SELECT id INTO target_governorate
  FROM ancestors
  WHERE type = 'governorate'
  LIMIT 1;

  IF target_org.type = 'governorate'
     AND source_org."parentOrganizationId" = target_org.id THEN
    requires_approval := false;
  ELSIF source_org.type = 'governorate'
     AND target_org."parentOrganizationId" = source_org.id THEN
    requires_approval := false;
  ELSIF target_org."parentOrganizationId" = source_org.id
     OR source_org."parentOrganizationId" = target_org.id THEN
    requires_approval := false;
  ELSIF source_governorate IS NOT NULL
     AND target_governorate IS NOT NULL THEN
    requires_approval := true;
  ELSE
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Telegram routing must follow the police hierarchy';
  END IF;

  INSERT INTO public.telegram_routes (
    "telegramId",
    "fromOrganizationId",
    "toOrganizationId",
    "forwardedByUserId",
    status,
    "approvalStatus",
    note
  )
  VALUES (
    p_telegram_id,
    p_from_organization_id,
    p_to_organization_id,
    p_forwarded_by_user_id,
    'sent',
    CASE WHEN requires_approval THEN 'pending' ELSE 'not_required' END,
    note_value
  )
  RETURNING * INTO route_row;

  IF requires_approval THEN
    INSERT INTO public.telegram_actions (
      "telegramId",
      "actorUserId",
      action,
      "fromStatus",
      "toStatus",
      reason,
      metadata
    )
    VALUES (
      p_telegram_id,
      p_forwarded_by_user_id,
      'telegram.route.requested',
      telegram_row.status,
      telegram_row.status,
      note_value,
      jsonb_build_object(
        'routeId', route_row.id,
        'toOrganizationId', p_to_organization_id
      )::text
    );
  ELSE
    UPDATE public.telegrams
    SET "currentOrganizationId" = p_to_organization_id,
        status = 'forwarded',
        "workflowReason" = note_value,
        "updatedAt" = now()
    WHERE id = p_telegram_id;

    INSERT INTO public.telegram_actions (
      "telegramId",
      "actorUserId",
      action,
      "fromStatus",
      "toStatus",
      reason,
      metadata
    )
    VALUES (
      p_telegram_id,
      p_forwarded_by_user_id,
      'telegram.route',
      telegram_row.status,
      'forwarded',
      note_value,
      jsonb_build_object(
        'routeId', route_row.id,
        'toOrganizationId', p_to_organization_id
      )::text
    );
  END IF;

  RETURN route_row;
END;
$$;

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
  required_governorate uuid;
  reason_value text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  SELECT * INTO route_row
  FROM public.telegram_routes
  WHERE id = p_route_id
  FOR UPDATE;

  IF NOT FOUND OR route_row."approvalStatus" <> 'pending' THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'Route is not awaiting approval';
  END IF;

  SELECT * INTO telegram_row
  FROM public.telegrams
  WHERE id = route_row."telegramId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'Telegram not found';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT id, "parentOrganizationId", type
    FROM public.organizations
    WHERE id = route_row."fromOrganizationId"

    UNION ALL

    SELECT parent.id, parent."parentOrganizationId", parent.type
    FROM public.organizations AS parent
    JOIN ancestors AS child ON parent.id = child."parentOrganizationId"
  )
  SELECT id INTO required_governorate
  FROM ancestors
  WHERE type = 'governorate'
  LIMIT 1;

  IF required_governorate IS NULL THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'A governorate command is required to approve this route';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS user_row
    WHERE user_row.id = p_approver_user_id
      AND user_row.role = 'admin'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships AS membership
    WHERE membership."userId" = p_approver_user_id
      AND membership."organizationId" = required_governorate
      AND membership."isActive" = true
      AND membership.role IN ('system_admin', 'organization_admin', 'reviewer')
  ) THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Only the governorate command may approve this route';
  END IF;

  IF NOT p_approved AND reason_value IS NULL THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'A reason is required when rejecting a route';
  END IF;

  UPDATE public.telegram_routes
  SET "approvalStatus" = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
      "approvedByUserId" = p_approver_user_id,
      "approvedAt" = now(),
      "approvalReason" = reason_value
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
      "telegramId",
      "actorUserId",
      action,
      "fromStatus",
      "toStatus",
      reason,
      metadata
    )
    VALUES (
      route_row."telegramId",
      p_approver_user_id,
      'telegram.route.approved',
      telegram_row.status,
      'forwarded',
      reason_value,
      jsonb_build_object(
        'routeId', route_row.id,
        'toOrganizationId', route_row."toOrganizationId"
      )::text
    );
  ELSE
    INSERT INTO public.telegram_actions (
      "telegramId",
      "actorUserId",
      action,
      "fromStatus",
      "toStatus",
      reason,
      metadata
    )
    VALUES (
      route_row."telegramId",
      p_approver_user_id,
      'telegram.route.rejected',
      telegram_row.status,
      telegram_row.status,
      reason_value,
      jsonb_build_object('routeId', route_row.id)::text
    );
  END IF;

  RETURN route_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_telegram_route(
  p_route_id integer,
  p_receiver_user_id integer
)
RETURNS public.telegram_routes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  route_row public.telegram_routes%rowtype;
  telegram_row public.telegrams%rowtype;
BEGIN
  SELECT * INTO route_row
  FROM public.telegram_routes
  WHERE id = p_route_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'Route not found';
  END IF;

  IF route_row.status <> 'sent'
     OR route_row."approvalStatus" NOT IN ('not_required', 'approved') THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'Route is not ready to receive';
  END IF;

  SELECT * INTO telegram_row
  FROM public.telegrams
  WHERE id = route_row."telegramId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = 'P0002', message = 'Telegram not found';
  END IF;

  IF telegram_row."currentOrganizationId" <> route_row."toOrganizationId" THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Telegram has not been assigned to the destination organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships AS membership
    WHERE membership."organizationId" = route_row."toOrganizationId"
      AND membership."userId" = p_receiver_user_id
      AND membership."isActive" = true
      AND membership.role IN (
        'system_admin',
        'organization_admin',
        'dispatcher',
        'reviewer'
      )
  ) THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'User is not authorized to receive this route';
  END IF;

  UPDATE public.telegram_routes
  SET status = 'received',
      "receivedAt" = now()
  WHERE id = p_route_id
  RETURNING * INTO route_row;

  INSERT INTO public.telegram_actions (
    "telegramId",
    "actorUserId",
    action,
    "fromStatus",
    "toStatus",
    metadata
  )
  VALUES (
    route_row."telegramId",
    p_receiver_user_id,
    'telegram.route.received',
    telegram_row.status,
    telegram_row.status,
    jsonb_build_object('routeId', route_row.id)::text
  );

  RETURN route_row;
END;
$$;

REVOKE ALL ON FUNCTION public.route_telegram(integer, uuid, uuid, integer, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.route_telegram(integer, uuid, uuid, integer, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.approve_telegram_route(integer, integer, boolean, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_telegram_route(integer, integer, boolean, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.receive_telegram_route(integer, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.receive_telegram_route(integer, integer)
  TO service_role;
