ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "isPlatformOwner" boolean NOT NULL DEFAULT false;

DO $migration$
DECLARE
  owner_count integer;
  owner_id integer;
BEGIN
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
    RAISE EXCEPTION 'Owner account is ambiguous; refusing to mark multiple platform owners';
  ELSIF owner_count = 1 THEN
    SELECT id INTO owner_id
    FROM public.users
    WHERE role = 'admin'
      AND "loginMethod" = 'password'
      AND email IS NULL
    ORDER BY id
    LIMIT 1;

    UPDATE public.users
    SET "isPlatformOwner" = true,
        "updatedAt" = now()
    WHERE id = owner_id;
  END IF;
END;
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS users_single_platform_owner_idx
  ON public.users ("isPlatformOwner")
  WHERE "isPlatformOwner" = true;

CREATE OR REPLACE FUNCTION public.guard_owner_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  target_user_id integer;
  owner_account boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_user_id := OLD."userId";
  ELSE
    target_user_id := NEW."userId";
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."userId" IS DISTINCT FROM NEW."userId" THEN
    SELECT "isPlatformOwner" INTO owner_account
    FROM public.users
    WHERE id = OLD."userId"
    LIMIT 1;

    IF coalesce(owner_account, false)
       AND current_setting('app.owner_workplace_switch', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Owner membership changes require the owner workplace selector'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT "isPlatformOwner" INTO owner_account
  FROM public.users
  WHERE id = target_user_id
  LIMIT 1;

  IF coalesce(owner_account, false) THEN
    IF current_setting('app.owner_workplace_switch', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Owner membership changes require the owner workplace selector'
        USING ERRCODE = '42501';
    END IF;

    IF TG_OP <> 'DELETE' THEN
      NEW.role := 'system_admin'::public.organization_member_role;
      RETURN NEW;
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_owner_membership_change
  ON public.organization_memberships;
CREATE TRIGGER guard_owner_membership_change
BEFORE INSERT OR UPDATE OR DELETE ON public.organization_memberships
FOR EACH ROW
EXECUTE FUNCTION public.guard_owner_membership_change();

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

REVOKE ALL ON FUNCTION public.guard_owner_membership_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_owner_workplace(integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_owner_workplace(integer, uuid)
  TO service_role;
