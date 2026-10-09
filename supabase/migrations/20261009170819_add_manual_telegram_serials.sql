-- Allow the create form to preview and explicitly reserve an outgoing telegram
-- number without weakening the organization-scoped sequencing guarantees.

CREATE OR REPLACE FUNCTION public.preview_organization_outgoing_serial(
  p_organization_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  settings_row public.department_settings%ROWTYPE;
  candidate bigint;
BEGIN
  SELECT * INTO settings_row
  FROM public.department_settings
  WHERE "organizationId" = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization settings not found';
  END IF;

  candidate := GREATEST(
    COALESCE(settings_row."nextOutgoingSerial", settings_row."serialStart", 1),
    COALESCE(settings_row."serialStart", 1),
    1
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

  RETURN candidate::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_organization_outgoing_serial(
  p_organization_id uuid,
  p_serial_number integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  settings_row public.department_settings%ROWTYPE;
  configured_start bigint;
  next_serial bigint;
BEGIN
  SELECT * INTO settings_row
  FROM public.department_settings
  WHERE "organizationId" = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization settings not found';
  END IF;

  configured_start := GREATEST(COALESCE(settings_row."serialStart", 1), 1);
  IF p_serial_number < configured_start THEN
    RAISE EXCEPTION 'Telegram serial number is below the configured starting number'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.telegrams
    WHERE "organizationId" = p_organization_id
      AND "organizationSerialNumber" = p_serial_number
  ) OR EXISTS (
    SELECT 1
    FROM public.telegram_routes
    WHERE "fromOrganizationId" = p_organization_id
      AND "routeSerialNumber" = p_serial_number
  ) THEN
    RAISE EXCEPTION 'رقم البرقية مستخدم بالفعل لهذه الجهة'
      USING ERRCODE = '23505';
  END IF;

  next_serial := GREATEST(
    COALESCE(settings_row."nextOutgoingSerial", configured_start),
    configured_start
  );

  -- Advancing the counter reserves the chosen number before the application
  -- writes the telegram. This mirrors normal automatic allocation and keeps a
  -- concurrent allocator from issuing the same value.
  IF p_serial_number >= next_serial THEN
    UPDATE public.department_settings
    SET "nextOutgoingSerial" = p_serial_number + 1,
        "updatedAt" = now()
    WHERE id = settings_row.id;
  END IF;

  RETURN p_serial_number;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_organization_outgoing_serial(uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_organization_outgoing_serial(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.reserve_organization_outgoing_serial(uuid, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_organization_outgoing_serial(uuid, integer)
  TO service_role;
