-- Use organizationId as the concurrency arbiter for organization-owned settings.
-- The old global configKey constraint conflicts with concurrent first saves, so
-- retain configKey uniqueness only for the legacy template rows (organizationId IS NULL).
ALTER TABLE public.department_settings
  DROP CONSTRAINT IF EXISTS "department_settings_configKey_key";

CREATE UNIQUE INDEX IF NOT EXISTS department_settings_legacy_config_key_unique_idx
  ON public.department_settings ("configKey")
  WHERE "organizationId" IS NULL;

-- The previous migration temporarily changed the conflict target to configKey.
-- Restore the organizationId-targeted atomic upsert after narrowing the legacy key index.
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
      "numberSystem" = (p_settings ->> 'numberSystem')::public.number_system,
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
      "numberSystem",
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
      (p_settings ->> 'numberSystem')::public.number_system,
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
      "numberSystem" = EXCLUDED."numberSystem",
      "logoUrl" = EXCLUDED."logoUrl",
      "updatedByUserId" = EXCLUDED."updatedByUserId",
      "updatedAt" = now()
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_department_settings_atomic(integer, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_department_settings_atomic(integer, uuid, jsonb)
  TO service_role;


-- The global serial allocator also inserts the legacy template row. Point its
-- conflict target at the partial unique index created above.
-- Keep telegram numbering monotonic even when settings drift behind existing rows.
-- The settings row lock serializes allocators; the unique constraint on serialNumber
-- remains the final database-level safeguard against duplicates.

create or replace function public.allocate_serial_number()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  allocated bigint;
  configured_start bigint;
  configured_next bigint;
  existing_max bigint;
begin
  insert into public.department_settings ("configKey")
  values ('primary')
  on conflict ("configKey") where "organizationId" is null do nothing;

  select "serialStart", "nextSerial"
    into configured_start, configured_next
    from public.department_settings
   where "configKey" = 'primary'
   for update;

  select coalesce(max("serialNumber")::bigint, 0)
    into existing_max
    from public.telegrams;

  allocated := greatest(
    coalesce(configured_start, 1),
    coalesce(configured_next, 1),
    existing_max + 1,
    1
  );

  if allocated >= 2147483647 then
    raise exception 'Telegram serial number limit reached'
      using errcode = '22003';
  end if;

  update public.department_settings
     set "nextSerial" = (allocated + 1)::integer,
         "updatedAt" = now()
   where "configKey" = 'primary';

  return allocated::integer;
end;
$$;

revoke all on function public.allocate_serial_number() from public, anon, authenticated;
grant execute on function public.allocate_serial_number() to service_role;
