-- Keep Shahbaa under Aleppo. Telegram rows retain their organization IDs.
DO $migration$
DECLARE
  central_id uuid;
  aleppo_id uuid;
  owner_id integer;
  owner_count integer;
  previous_organization_id uuid;
BEGIN
  SELECT id INTO central_id
  FROM public.organizations
  WHERE code = 'LEGACY-PRIMARY'
    AND type = 'central'
    AND "isActive" = true
  LIMIT 1;

  IF central_id IS NULL THEN
    RAISE EXCEPTION 'Active central organization LEGACY-PRIMARY is missing';
  END IF;

  SELECT id INTO aleppo_id
  FROM public.organizations
  WHERE code = 'GOV-ALEPPO'
    AND type = 'governorate'
    AND "isActive" = true
  LIMIT 1;

  IF aleppo_id IS NOT NULL THEN
    UPDATE public.organizations
    SET "parentOrganizationId" = aleppo_id,
        "updatedAt" = now()
    WHERE code = 'ALSHAHBAA';
  ELSE
    RAISE NOTICE 'Skipping Shahbaa hierarchy update: GOV-ALEPPO is not seeded in this database';
  END IF;

  SELECT count(*) INTO owner_count
  FROM (
    SELECT id
    FROM public.users
    WHERE role = 'admin'
      AND "loginMethod" = 'password'
      AND email IS NULL
    ORDER BY id
    LIMIT 2
  ) AS owner_candidates;

  IF owner_count > 1 THEN
    RAISE EXCEPTION 'Owner account is ambiguous; refusing to change account assignments';
  ELSIF owner_count = 1 THEN
    SELECT id, "organizationId"
    INTO owner_id, previous_organization_id
    FROM public.users
    WHERE role = 'admin'
      AND "loginMethod" = 'password'
      AND email IS NULL
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    UPDATE public.users
    SET "organizationId" = central_id,
        "updatedAt" = now()
    WHERE id = owner_id;

    UPDATE public.organization_memberships
    SET "isActive" = false,
        "updatedAt" = now()
    WHERE "userId" = owner_id
      AND "isActive" = true;

    INSERT INTO public.organization_memberships (
      "organizationId",
      "userId",
      role,
      "isActive"
    )
    VALUES (
      central_id,
      owner_id,
      'system_admin'::public.organization_member_role,
      true
    )
    ON CONFLICT ("organizationId", "userId") DO UPDATE
    SET role = 'system_admin'::public.organization_member_role,
        "isActive" = true,
        "updatedAt" = now();

    IF previous_organization_id IS DISTINCT FROM central_id THEN
      INSERT INTO public.audit_logs (
        "actorUserId",
        "actorName",
        action,
        "entityType",
        "entityId",
        metadata
      )
      VALUES (
        owner_id,
        'مالك النظام',
        'owner.organization.reassigned',
        'organization_membership',
        owner_id::text,
        jsonb_build_object(
          'fromOrganizationId', previous_organization_id,
          'toOrganizationId', central_id
        )::text
      );
    END IF;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.set_owner_workplace(
  p_user_id integer,
  p_organization_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  owner_row public.users%ROWTYPE;
  target_row public.organizations%ROWTYPE;
  previous_organization_id uuid;
BEGIN
  SELECT * INTO owner_row
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
     OR owner_row.role <> 'admin'
     OR owner_row."loginMethod" <> 'password'
     OR owner_row.email IS NOT NULL THEN
    RAISE EXCEPTION 'Owner-only workplace selection is not authorized'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_row
  FROM public.organizations
  WHERE id = p_organization_id
    AND "isActive" = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected organization is missing or inactive'
      USING ERRCODE = '22023';
  END IF;

  SELECT "organizationId" INTO previous_organization_id
  FROM public.organization_memberships
  WHERE "userId" = p_user_id
    AND "isActive" = true
  ORDER BY "createdAt"
  LIMIT 1;

  UPDATE public.organization_memberships
  SET "isActive" = false,
      "updatedAt" = now()
  WHERE "userId" = p_user_id
    AND "isActive" = true;

  INSERT INTO public.organization_memberships (
    "organizationId",
    "userId",
    role,
    "isActive"
  )
  VALUES (
    p_organization_id,
    p_user_id,
    'system_admin'::public.organization_member_role,
    true
  )
  ON CONFLICT ("organizationId", "userId") DO UPDATE
  SET role = 'system_admin'::public.organization_member_role,
      "isActive" = true,
      "updatedAt" = now();

  INSERT INTO public.audit_logs (
    "actorUserId",
    "actorName",
    action,
    "entityType",
    "entityId",
    metadata
  )
  VALUES (
    p_user_id,
    'مالك النظام',
    'owner.workplace.select',
    'organization',
    p_organization_id::text,
    jsonb_build_object(
      'fromOrganizationId', previous_organization_id,
      'toOrganizationId', p_organization_id,
      'organizationName', target_row.name
    )::text
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_owner_workplace(integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_owner_workplace(integer, uuid)
  TO service_role;
