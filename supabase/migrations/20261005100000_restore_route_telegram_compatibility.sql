-- Keep the six-argument function canonical and restore the legacy five-argument API.
DROP FUNCTION IF EXISTS public.route_telegram(integer, uuid, uuid, integer, text);
DROP FUNCTION IF EXISTS public.route_telegram(integer, uuid, uuid, integer, text, boolean);

-- Allow a newly created draft to use its explicitly configured destination, but only through an explicit server flag.
CREATE OR REPLACE FUNCTION public.route_telegram(
  p_telegram_id integer,
  p_from_organization_id uuid,
  p_to_organization_id uuid,
  p_forwarded_by_user_id integer,
  p_note text,
  p_allow_draft boolean
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
  is_configured_destination boolean := false;
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

  IF telegram_row.status NOT IN ('approved', 'in_progress', 'forwarded')
     AND NOT (p_allow_draft AND telegram_row.status = 'draft') THEN
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

  is_configured_destination :=
    source_org."telegramDestinationOrganizationId" = target_org.id;

  IF NOT is_configured_destination AND NOT (
    target_org."parentOrganizationId" = source_org.id
    OR source_org."parentOrganizationId" = target_org.id
  ) THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Telegram routing is limited to directly connected organizations';
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

  IF is_configured_destination THEN
    requires_approval := false;
  ELSIF target_org.type = 'governorate'
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
      "telegramId", "actorUserId", action, "fromStatus", "toStatus", reason, metadata
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
      "telegramId", "actorUserId", action, "fromStatus", "toStatus", reason, metadata
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

REVOKE ALL ON FUNCTION public.route_telegram(integer, uuid, uuid, integer, text, boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.route_telegram(integer, uuid, uuid, integer, text, boolean)
  TO service_role;


-- Existing callers use the five-argument API. Draft routing remains disabled.
CREATE OR REPLACE FUNCTION public.route_telegram(
  p_telegram_id integer,
  p_from_organization_id uuid,
  p_to_organization_id uuid,
  p_forwarded_by_user_id integer,
  p_note text DEFAULT NULL
)
RETURNS public.telegram_routes
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.route_telegram(
    p_telegram_id,
    p_from_organization_id,
    p_to_organization_id,
    p_forwarded_by_user_id,
    p_note,
    false
  );
$$;

REVOKE ALL ON FUNCTION public.route_telegram(integer, uuid, uuid, integer, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.route_telegram(integer, uuid, uuid, integer, text)
  TO service_role;
