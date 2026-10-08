-- Organization-facing telegram numbers start from each organization's configured
-- serialStart. Deleted records reopen their number for the next allocation.
--
-- The global telegram serial remains an internal, globally unique identifier;
-- this allocator governs the outgoing/incoming number printed and shown for the
-- owning organization.

-- Some deployed databases received the incoming fields before the outgoing
-- route fields. Bring both shapes to the same contract before indexing them.
ALTER TABLE public.telegram_routes
  ADD COLUMN IF NOT EXISTS "routeSerialNumber" integer,
  ADD COLUMN IF NOT EXISTS "routeSerialCode" varchar(48);

CREATE INDEX IF NOT EXISTS telegram_routes_outgoing_serial_idx
  ON public.telegram_routes ("fromOrganizationId", "routeSerialNumber")
  WHERE "routeSerialNumber" IS NOT NULL;

CREATE OR REPLACE FUNCTION public.allocate_organization_serial(
  p_organization_id uuid,
  p_direction text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  settings_row public.department_settings%ROWTYPE;
  configured_start bigint;
  candidate bigint;
BEGIN
  IF p_direction NOT IN ('outgoing', 'incoming') THEN
    RAISE EXCEPTION 'Invalid serial direction';
  END IF;

  -- The row lock keeps allocations for one organization and direction ordered.
  SELECT * INTO settings_row
  FROM public.department_settings
  WHERE "organizationId" = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization settings not found';
  END IF;

  configured_start := GREATEST(COALESCE(settings_row."serialStart", 1), 1);

  IF p_direction = 'outgoing' THEN
    candidate := GREATEST(
      COALESCE(settings_row."nextOutgoingSerial", configured_start),
      configured_start
    );

    WITH used AS (
      SELECT "organizationSerialNumber"::bigint AS serial
      FROM public.telegrams
      WHERE "organizationId" = p_organization_id
        AND "organizationSerialNumber" IS NOT NULL
        AND "organizationSerialNumber" >= candidate
      UNION
      SELECT "routeSerialNumber"::bigint AS serial
      FROM public.telegram_routes
      WHERE "fromOrganizationId" = p_organization_id
        AND "routeSerialNumber" IS NOT NULL
        AND "routeSerialNumber" >= candidate
    ),
    gaps AS (
      SELECT serial, lead(serial) OVER (ORDER BY serial) AS next_serial
      FROM used
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM used WHERE serial = candidate) THEN candidate
      ELSE COALESCE(
        (
          SELECT serial + 1
          FROM gaps
          WHERE next_serial IS NULL OR next_serial > serial + 1
          ORDER BY serial
          LIMIT 1
        ),
        candidate
      )
    END
    INTO candidate;

    IF candidate >= 2147483647 THEN
      RAISE EXCEPTION 'Organization serial number limit reached'
        USING ERRCODE = '22003';
    END IF;

    UPDATE public.department_settings
    SET "nextOutgoingSerial" = (candidate + 1)::integer,
        "updatedAt" = now()
    WHERE id = settings_row.id;
  ELSE
    candidate := GREATEST(
      COALESCE(settings_row."nextIncomingSerial", configured_start),
      configured_start
    );

    WITH used AS (
      SELECT "incomingSerialNumber"::bigint AS serial
      FROM public.telegram_routes
      WHERE "toOrganizationId" = p_organization_id
        AND "incomingSerialNumber" IS NOT NULL
        AND "incomingSerialNumber" >= candidate
    ),
    gaps AS (
      SELECT serial, lead(serial) OVER (ORDER BY serial) AS next_serial
      FROM used
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM used WHERE serial = candidate) THEN candidate
      ELSE COALESCE(
        (
          SELECT serial + 1
          FROM gaps
          WHERE next_serial IS NULL OR next_serial > serial + 1
          ORDER BY serial
          LIMIT 1
        ),
        candidate
      )
    END
    INTO candidate;

    IF candidate >= 2147483647 THEN
      RAISE EXCEPTION 'Organization serial number limit reached'
        USING ERRCODE = '22003';
    END IF;

    UPDATE public.department_settings
    SET "nextIncomingSerial" = (candidate + 1)::integer,
        "updatedAt" = now()
    WHERE id = settings_row.id;
  END IF;

  RETURN candidate::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.reclaim_organization_serial_on_telegram_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD."organizationSerialNumber" IS NOT NULL THEN
    UPDATE public.department_settings
    SET "nextOutgoingSerial" = LEAST(
          COALESCE("nextOutgoingSerial", OLD."organizationSerialNumber"),
          OLD."organizationSerialNumber"
        ),
        "updatedAt" = now()
    WHERE "organizationId" = OLD."organizationId";
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.reclaim_organization_serial_on_route_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD."routeSerialNumber" IS NOT NULL THEN
    UPDATE public.department_settings
    SET "nextOutgoingSerial" = LEAST(
          COALESCE("nextOutgoingSerial", OLD."routeSerialNumber"),
          OLD."routeSerialNumber"
        ),
        "updatedAt" = now()
    WHERE "organizationId" = OLD."fromOrganizationId";
  END IF;

  IF OLD."incomingSerialNumber" IS NOT NULL THEN
    UPDATE public.department_settings
    SET "nextIncomingSerial" = LEAST(
          COALESCE("nextIncomingSerial", OLD."incomingSerialNumber"),
          OLD."incomingSerialNumber"
        ),
        "updatedAt" = now()
    WHERE "organizationId" = OLD."toOrganizationId";
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS telegrams_reclaim_organization_serial ON public.telegrams;
CREATE TRIGGER telegrams_reclaim_organization_serial
AFTER DELETE ON public.telegrams
FOR EACH ROW EXECUTE FUNCTION public.reclaim_organization_serial_on_telegram_delete();

DROP TRIGGER IF EXISTS telegram_routes_reclaim_organization_serial ON public.telegram_routes;
CREATE TRIGGER telegram_routes_reclaim_organization_serial
AFTER DELETE ON public.telegram_routes
FOR EACH ROW EXECUTE FUNCTION public.reclaim_organization_serial_on_route_delete();

-- Existing rows may already contain gaps created by past deletions. Rebase both
-- cursors so the next allocation finds the first available number at serialStart.
UPDATE public.department_settings
SET "nextOutgoingSerial" = GREATEST(COALESCE("serialStart", 1), 1),
    "nextIncomingSerial" = GREATEST(COALESCE("serialStart", 1), 1),
    "updatedAt" = now()
WHERE "organizationId" IS NOT NULL;

-- Approval can allocate an outgoing number for legacy pending routes. Delegate
-- it to the same gap-aware allocator instead of incrementing a stale counter.
CREATE OR REPLACE FUNCTION public.approve_telegram_route(
  p_route_id integer,
  p_approver_user_id integer,
  p_approved boolean,
  p_reason text DEFAULT NULL
)
RETURNS public.telegram_routes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  route_row public.telegram_routes%ROWTYPE;
  telegram_row public.telegrams%ROWTYPE;
  source_org public.organizations%ROWTYPE;
  approver_org_id uuid;
  route_serial integer;
  route_serial_code varchar(48);
  settings_row public.department_settings%ROWTYPE;
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

    route_serial := public.allocate_organization_serial(
      approver_org_id,
      'outgoing'
    );

    SELECT * INTO settings_row
    FROM public.department_settings
    WHERE "organizationId" = approver_org_id;

    route_serial_code := coalesce(nullif(settings_row."serialPrefix", ''), 'POL') || '-' ||
      to_char(now() AT TIME ZONE coalesce(nullif(settings_row."timezone", ''), 'Asia/Damascus'), 'YYYY-MM-DD') || '-' ||
      lpad(route_serial::text, 5, '0');
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

REVOKE ALL ON FUNCTION public.allocate_organization_serial(uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_organization_serial(uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.reclaim_organization_serial_on_telegram_delete()
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reclaim_organization_serial_on_route_delete()
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_telegram_route(integer, integer, boolean, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_telegram_route(integer, integer, boolean, text)
  TO service_role;
