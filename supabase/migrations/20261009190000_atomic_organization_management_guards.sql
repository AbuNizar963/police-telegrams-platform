-- Enforce a single ministry root even when two application requests race.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_single_central_root_idx
  ON public.organizations ("type")
  WHERE "type" = 'central';

-- Serialize parent changes and reject self-links or cycles at the database boundary.
CREATE OR REPLACE FUNCTION public.enforce_organization_parent_acyclic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  introduces_cycle boolean;
BEGIN
  IF NEW."type" = 'central' AND NEW."parentOrganizationId" IS NOT NULL THEN
    RAISE EXCEPTION 'The ministry root cannot have a parent'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."parentOrganizationId" IS NULL THEN
    RETURN NEW;
  END IF;

  -- All parent-link writes take the same transaction lock before inspecting
  -- ancestry, so concurrent owner overrides cannot create A -> B -> A.
  PERFORM pg_catalog.pg_advisory_xact_lock(742913, 1);

  IF NEW."parentOrganizationId" = NEW.id THEN
    RAISE EXCEPTION 'An organization cannot be its own parent'
      USING ERRCODE = '23514';
  END IF;

  WITH RECURSIVE ancestry(id, parent_id, visited, cycle) AS (
    SELECT
      organization.id,
      organization."parentOrganizationId",
      ARRAY[organization.id]::uuid[],
      false
    FROM public.organizations AS organization
    WHERE organization.id = NEW."parentOrganizationId"

    UNION ALL

    SELECT
      parent.id,
      parent."parentOrganizationId",
      ancestry.visited || parent.id,
      parent.id = ANY(ancestry.visited)
    FROM public.organizations AS parent
    JOIN ancestry ON parent.id = ancestry.parent_id
    WHERE NOT ancestry.cycle
  )
  SELECT COALESCE(bool_or(id = NEW.id OR cycle), false)
    INTO introduces_cycle
  FROM ancestry;

  IF introduces_cycle THEN
    RAISE EXCEPTION 'Organization parent change would create a hierarchy cycle'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_parent_acyclic_guard
  ON public.organizations;
CREATE TRIGGER organizations_parent_acyclic_guard
  BEFORE INSERT OR UPDATE OF "parentOrganizationId", type
  ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_organization_parent_acyclic();

-- Save organization settings in one statement. The database compares the
-- requested numbering configuration against the row version it actually locks;
-- stale forms therefore cannot roll back an allocator's newer counter.
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
