-- Create and route all broadcast copies in one database transaction.
-- If any destination fails validation or routing, PostgreSQL rolls back every
-- route and copy created by this function; the primary telegram remains a draft.
CREATE OR REPLACE FUNCTION public.route_telegram_broadcast_atomic(
  p_primary_telegram_id integer,
  p_from_organization_id uuid,
  p_primary_to_organization_id uuid,
  p_forwarded_by_user_id integer,
  p_primary_note text,
  p_copies jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  primary_route public.telegram_routes%rowtype;
  copy_payload jsonb;
  copy_row public.telegrams%rowtype;
  copy_route public.telegram_routes%rowtype;
  copy_results jsonb := '[]'::jsonb;
  target_id uuid;
  seen_targets uuid[] := ARRAY[p_primary_to_organization_id];
BEGIN
  IF jsonb_typeof(p_copies) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'Broadcast copies must be supplied as an array';
  END IF;

  IF jsonb_array_length(p_copies) > 100 THEN
    RAISE EXCEPTION USING
      errcode = '22023',
      message = 'Broadcast target limit exceeded';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = p_from_organization_id
      AND "isActive" = true
  ) THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Source organization is inactive or unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE id = p_primary_to_organization_id
      AND "parentOrganizationId" = p_from_organization_id
      AND "isActive" = true
  ) THEN
    RAISE EXCEPTION USING
      errcode = '42501',
      message = 'Primary broadcast target must be an active direct child';
  END IF;

  -- This route and all following inserts/routes share the caller's transaction.
  primary_route := public.route_telegram(
    p_primary_telegram_id,
    p_from_organization_id,
    p_primary_to_organization_id,
    p_forwarded_by_user_id,
    p_primary_note,
    true
  );

  FOR copy_payload IN
    SELECT value FROM jsonb_array_elements(p_copies) AS entries(value)
  LOOP
    target_id := NULLIF(copy_payload->>'targetOrganizationId', '')::uuid;

    IF target_id IS NULL OR target_id = ANY(seen_targets) THEN
      RAISE EXCEPTION USING
        errcode = '22023',
        message = 'Broadcast targets must be valid and unique';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.organizations
      WHERE id = target_id
        AND "parentOrganizationId" = p_from_organization_id
        AND "isActive" = true
    ) THEN
      RAISE EXCEPTION USING
        errcode = '42501',
        message = 'Every broadcast target must be an active direct child';
    END IF;

    INSERT INTO public.telegrams (
      "serialNumber",
      "serialCode",
      "idempotencyKey",
      "verificationToken",
      "createdByUserId",
      "organizationId",
      "currentOrganizationId",
      "organizationSerialNumber",
      "organizationSerialCode",
      "creatorName",
      "creatorEmail",
      "creatorBadgeId",
      "creatorIp",
      "creatorFingerprint",
      subject,
      recipient,
      body,
      classification,
      priority,
      category,
      status,
      "workflowReason",
      "attachmentManifest",
      "gpsLatitude",
      "gpsLongitude"
    )
    VALUES (
      (copy_payload->>'serialNumber')::integer,
      copy_payload->>'serialCode',
      NULL,
      (copy_payload->>'verificationToken')::uuid,
      p_forwarded_by_user_id,
      p_from_organization_id,
      p_from_organization_id,
      (copy_payload->>'organizationSerialNumber')::integer,
      copy_payload->>'organizationSerialCode',
      copy_payload->>'creatorName',
      NULLIF(copy_payload->>'creatorEmail', ''),
      NULLIF(copy_payload->>'creatorBadgeId', ''),
      NULLIF(copy_payload->>'creatorIp', ''),
      NULLIF(copy_payload->>'creatorFingerprint', ''),
      copy_payload->>'subject',
      copy_payload->>'recipient',
      copy_payload->>'body',
      COALESCE(
        NULLIF(copy_payload->>'classification', '')::public.telegram_classification,
        'normal'::public.telegram_classification
      ),
      COALESCE(
        NULLIF(copy_payload->>'priority', '')::public.telegram_priority,
        'normal'::public.telegram_priority
      ),
      COALESCE(
        NULLIF(copy_payload->>'category', '')::public.telegram_category,
        'administrative'::public.telegram_category
      ),
      'draft'::public.telegram_status,
      NULLIF(copy_payload->>'workflowReason', ''),
      NULLIF(copy_payload->>'attachmentManifest', ''),
      NULLIF(copy_payload->>'gpsLatitude', ''),
      NULLIF(copy_payload->>'gpsLongitude', '')
    )
    RETURNING * INTO copy_row;

    copy_route := public.route_telegram(
      copy_row.id,
      p_from_organization_id,
      target_id,
      p_forwarded_by_user_id,
      'إرسال جماعي إلى الوحدات التابعة مباشرة',
      true
    );

    seen_targets := array_append(seen_targets, target_id);
    copy_results := copy_results || jsonb_build_array(
      jsonb_build_object(
        'telegramId', copy_row.id,
        'routeId', copy_route.id,
        'targetOrganizationId', target_id
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'primaryRoute', to_jsonb(primary_route),
    'copies', copy_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.route_telegram_broadcast_atomic(
  integer, uuid, uuid, integer, text, jsonb
) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.route_telegram_broadcast_atomic(
  integer, uuid, uuid, integer, text, jsonb
) TO service_role;
