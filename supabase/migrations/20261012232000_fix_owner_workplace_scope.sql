-- Keep the owner's canonical users.organizationId synchronized with the
-- active workplace membership. Telegram queries use this canonical scope.
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
     OR owner_row."isPlatformOwner" IS DISTINCT FROM true
     OR owner_row.role <> 'admin' THEN
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

  PERFORM set_config('app.owner_workplace_switch', 'true', true);

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

  -- This is the missing link: all scoped reads derive the active workplace
  -- from users.organizationId, including telegrams, settings and reports.
  UPDATE public.users
  SET "organizationId" = p_organization_id,
      "updatedAt" = now()
  WHERE id = p_user_id;

  PERFORM set_config('app.owner_workplace_switch', '', true);

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
