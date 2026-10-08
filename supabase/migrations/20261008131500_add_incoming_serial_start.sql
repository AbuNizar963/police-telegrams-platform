-- Incoming numbering can start independently from outgoing telegrams.
ALTER TABLE public.department_settings
  ADD COLUMN IF NOT EXISTS "incomingSerialStart" integer NOT NULL DEFAULT 1;

-- Preserve each organization's current behavior until it configures a separate
-- incoming start: initialize the new value from its existing serialStart.
UPDATE public.department_settings
SET "incomingSerialStart" = GREATEST(COALESCE("serialStart", 1), 1);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.department_settings'::regclass
      AND conname = 'department_settings_incoming_serial_start_positive'
  ) THEN
    ALTER TABLE public.department_settings
      ADD CONSTRAINT department_settings_incoming_serial_start_positive
      CHECK ("incomingSerialStart" > 0);
  END IF;
END;
$$;

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

  IF p_direction = 'incoming' THEN
    configured_start := GREATEST(
      COALESCE(settings_row."incomingSerialStart", settings_row."serialStart", 1),
      1
    );
  ELSE
    configured_start := GREATEST(COALESCE(settings_row."serialStart", 1), 1);
  END IF;

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

REVOKE ALL ON FUNCTION public.allocate_organization_serial(uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_organization_serial(uuid, text)
  TO service_role;
