-- Keep existing telegram verification data intact; this setting only controls
-- whether the verification QR is rendered into a printed/exported document.
ALTER TABLE public.department_settings
  ADD COLUMN IF NOT EXISTS "showVerificationQr" boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.department_settings."showVerificationQr" IS
  'Controls whether the telegram verification QR is shown in exported documents; verification tokens and URLs remain active.';

-- Extend the existing organization-scoped atomic save so this setting is
-- persisted with the rest of the organization's settings. Missing values from
-- older clients preserve the current value on update and default to true on insert.
CREATE OR REPLACE FUNCTION public.save_department_settings_atomic(
  p_settings_id integer,
  p_organization_id uuid,
  p_settings jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id integer;
  v_serial_start integer := GREATEST(
    COALESCE((p_settings ->> 'serialStart')::integer, 1),
    1
  );
  v_incoming_serial_start integer := GREATEST(
    COALESCE((p_settings ->> 'incomingSerialStart')::integer, 1),
    1
  );
  v_next_serial integer := GREATEST(
    COALESCE((p_settings ->> 'nextSerial')::integer, 1),
    1
  );
BEGIN
  IF p_settings IS NULL THEN
    RAISE EXCEPTION 'Settings payload is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_settings_id IS NULL AND p_organization_id IS NULL THEN
    RAISE EXCEPTION 'A target settings row or organization is required'
      USING ERRCODE = '22023';
  END IF;

  IF p_settings_id IS NOT NULL THEN
    UPDATE public.department_settings AS current_settings
    SET
      "departmentName" = p_settings ->> 'departmentName',
      "unitName" = p_settings ->> 'unitName',
      "unitChiefRank" = p_settings ->> 'unitChiefRank',
      "unitChiefName" = p_settings ->> 'unitChiefName',
      "serialPrefix" = p_settings ->> 'serialPrefix',
      "incomingSerialPrefix" = p_settings ->> 'incomingSerialPrefix',
      "serialStart" = v_serial_start,
      "incomingSerialStart" = v_incoming_serial_start,
      "nextSerial" = GREATEST(current_settings."nextSerial", v_next_serial),
      "nextOutgoingSerial" = CASE
        WHEN current_settings."serialPrefix" IS DISTINCT FROM p_settings ->> 'serialPrefix'
          OR current_settings."serialStart" IS DISTINCT FROM v_serial_start
        THEN v_serial_start
        ELSE current_settings."nextOutgoingSerial"
      END,
      "nextIncomingSerial" = CASE
        WHEN current_settings."incomingSerialPrefix" IS DISTINCT FROM p_settings ->> 'incomingSerialPrefix'
          OR current_settings."incomingSerialStart" IS DISTINCT FROM v_incoming_serial_start
        THEN v_incoming_serial_start
        ELSE current_settings."nextIncomingSerial"
      END,
      timezone = p_settings ->> 'timezone',
      "dateFormat" = p_settings ->> 'dateFormat',
      "timeFormat" = COALESCE(
        p_settings ->> 'timeFormat',
        current_settings."timeFormat"
      ),
      "numberSystem" = (p_settings ->> 'numberSystem')::public.number_system,
      "showVerificationQr" = COALESCE(
        (p_settings ->> 'showVerificationQr')::boolean,
        current_settings."showVerificationQr"
      ),
      "logoUrl" = p_settings ->> 'logoUrl',
      "updatedByUserId" = (p_settings ->> 'updatedByUserId')::integer,
      "updatedAt" = now()
    WHERE current_settings.id = p_settings_id
      AND current_settings."organizationId" IS NOT DISTINCT FROM p_organization_id
    RETURNING current_settings.id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Settings row does not match the requested organization'
        USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.department_settings AS current_settings (
      "configKey",
      "organizationId",
      "departmentName",
      "unitName",
      "unitChiefRank",
      "unitChiefName",
      "serialPrefix",
      "incomingSerialPrefix",
      "serialStart",
      "incomingSerialStart",
      "nextSerial",
      "nextOutgoingSerial",
      "nextIncomingSerial",
      timezone,
      "dateFormat",
      "timeFormat",
      "numberSystem",
      "showVerificationQr",
      "logoUrl",
      "updatedByUserId"
    )
    VALUES (
      'org:' || p_organization_id::text,
      p_organization_id,
      p_settings ->> 'departmentName',
      p_settings ->> 'unitName',
      p_settings ->> 'unitChiefRank',
      p_settings ->> 'unitChiefName',
      p_settings ->> 'serialPrefix',
      p_settings ->> 'incomingSerialPrefix',
      v_serial_start,
      v_incoming_serial_start,
      v_next_serial,
      v_serial_start,
      v_incoming_serial_start,
      p_settings ->> 'timezone',
      p_settings ->> 'dateFormat',
      COALESCE(p_settings ->> 'timeFormat', '24'),
      (p_settings ->> 'numberSystem')::public.number_system,
      COALESCE((p_settings ->> 'showVerificationQr')::boolean, true),
      p_settings ->> 'logoUrl',
      (p_settings ->> 'updatedByUserId')::integer
    )
    ON CONFLICT ("organizationId") DO UPDATE
    SET
      "departmentName" = EXCLUDED."departmentName",
      "unitName" = EXCLUDED."unitName",
      "unitChiefRank" = EXCLUDED."unitChiefRank",
      "unitChiefName" = EXCLUDED."unitChiefName",
      "serialPrefix" = EXCLUDED."serialPrefix",
      "incomingSerialPrefix" = EXCLUDED."incomingSerialPrefix",
      "serialStart" = EXCLUDED."serialStart",
      "incomingSerialStart" = EXCLUDED."incomingSerialStart",
      "nextSerial" = GREATEST(
        current_settings."nextSerial",
        EXCLUDED."nextSerial"
      ),
      "nextOutgoingSerial" = CASE
        WHEN current_settings."serialPrefix" IS DISTINCT FROM EXCLUDED."serialPrefix"
          OR current_settings."serialStart" IS DISTINCT FROM EXCLUDED."serialStart"
        THEN EXCLUDED."serialStart"
        ELSE current_settings."nextOutgoingSerial"
      END,
      "nextIncomingSerial" = CASE
        WHEN current_settings."incomingSerialPrefix" IS DISTINCT FROM EXCLUDED."incomingSerialPrefix"
          OR current_settings."incomingSerialStart" IS DISTINCT FROM EXCLUDED."incomingSerialStart"
        THEN EXCLUDED."incomingSerialStart"
        ELSE current_settings."nextIncomingSerial"
      END,
      timezone = EXCLUDED.timezone,
      "dateFormat" = EXCLUDED."dateFormat",
      "timeFormat" = EXCLUDED."timeFormat",
      "numberSystem" = EXCLUDED."numberSystem",
      "showVerificationQr" = EXCLUDED."showVerificationQr",
      "logoUrl" = EXCLUDED."logoUrl",
      "updatedByUserId" = EXCLUDED."updatedByUserId",
      "updatedAt" = now()
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;
