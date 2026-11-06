-- Enterprise employee transfer workflow.
-- The employee identity is retained; only the active organization assignment changes.
-- The old membership remains inactive and a tamper-evident audit event records the move.

CREATE OR REPLACE FUNCTION public.transfer_employee_to_organization(
  p_user_id integer,
  p_target_organization_id uuid,
  p_target_role public.organization_member_role,
  p_actor_user_id integer,
  p_actor_name text,
  p_actor_rank text DEFAULT NULL,
  p_actor_role text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_type text DEFAULT 'unknown'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_employee public.users%ROWTYPE;
  v_source public.organizations%ROWTYPE;
  v_target public.organizations%ROWTYPE;
  v_previous_role public.organization_member_role;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'A transfer reason of at least 8 characters is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS actor
    WHERE actor.id = p_actor_user_id
      AND actor."isActive" = true
      AND actor."loginMethod" IS DISTINCT FROM 'disabled'
  ) THEN
    RAISE EXCEPTION 'The acting account is inactive'
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_user_id = p_user_id THEN
    RAISE EXCEPTION 'An administrator cannot transfer their own account'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_employee
    FROM public.users
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee account not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_employee."isPlatformOwner" = true OR v_employee.role = 'admin'::public.user_role THEN
    RAISE EXCEPTION 'Platform owner accounts cannot be transferred through employee management'
      USING ERRCODE = '42501';
  END IF;

  IF v_employee."isActive" IS DISTINCT FROM true
     OR v_employee."loginMethod" = 'disabled' THEN
    RAISE EXCEPTION 'Only active employee accounts can be transferred'
      USING ERRCODE = '22023';
  END IF;

  IF v_employee."organizationId" = p_target_organization_id THEN
    RAISE EXCEPTION 'The employee already belongs to the selected organization'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_source
    FROM public.organizations
   WHERE id = v_employee."organizationId"
   FOR SHARE;

  IF NOT FOUND OR v_source."isActive" IS DISTINCT FROM true OR v_source."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'The employee current organization is inactive or archived'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_target
    FROM public.organizations
   WHERE id = p_target_organization_id
   FOR SHARE;

  IF NOT FOUND OR v_target."isActive" IS DISTINCT FROM true OR v_target."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'The destination organization is missing, inactive, or archived'
      USING ERRCODE = '22023';
  END IF;

  SELECT role
    INTO v_previous_role
    FROM public.organization_memberships
   WHERE "userId" = p_user_id
     AND "organizationId" = v_source.id
     AND "isActive" = true
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The employee has no active membership in the current organization'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.organization_memberships
     SET "isActive" = false,
         "updatedAt" = now()
   WHERE "userId" = p_user_id
     AND "organizationId" = v_source.id
     AND "isActive" = true;

  INSERT INTO public.organization_memberships (
    "organizationId",
    "userId",
    role,
    "isActive"
  )
  VALUES (
    v_target.id,
    p_user_id,
    p_target_role,
    true
  )
  ON CONFLICT ("organizationId", "userId") DO UPDATE
    SET role = EXCLUDED.role,
        "isActive" = true,
        "updatedAt" = now();

  -- Rotate the session identity so tokens minted under the old organization
  -- scope stop authenticating immediately; the employee keeps the same login
  -- and password and simply signs in again.
  UPDATE public.users
     SET "organizationId" = v_target.id,
         "authUserId" = gen_random_uuid(),
         "updatedAt" = now()
   WHERE id = p_user_id;

  -- Keep the device registrations with the employee, but scope them to the
  -- destination organization. Historical notifications are intentionally kept.
  UPDATE public.push_subscriptions
     SET "organizationId" = v_target.id,
         "updatedAt" = now()
   WHERE "userId" = p_user_id;

  UPDATE public.mobile_push_tokens
     SET "organizationId" = v_target.id,
         "updatedAt" = now()
   WHERE "userId" = p_user_id;

  INSERT INTO public.audit_logs (
    "actorUserId",
    "actorName",
    "actorRank",
    "actorRole",
    "organizationId",
    action,
    "entityType",
    "entityId",
    metadata,
    reason,
    "beforeState",
    "afterState",
    "ipAddress",
    "userAgent",
    "deviceType"
  )
  VALUES (
    p_actor_user_id,
    left(coalesce(nullif(btrim(p_actor_name), ''), 'مسؤول النظام'), 255),
    p_actor_rank,
    p_actor_role,
    v_target.id,
    'employee.transfer',
    'user',
    p_user_id::text,
    jsonb_build_object(
      'employeeId', p_user_id,
      'fromOrganizationId', v_source.id,
      'fromOrganizationName', v_source.name,
      'toOrganizationId', v_target.id,
      'toOrganizationName', v_target.name,
      'previousRole', v_previous_role,
      'newRole', p_target_role,
      'sessionRevoked', true
    )::text,
    left(btrim(p_reason), 2000),
    jsonb_build_object(
      'userId', p_user_id,
      'organizationId', v_source.id,
      'organizationName', v_source.name,
      'membershipRole', v_previous_role
    )::text,
    jsonb_build_object(
      'userId', p_user_id,
      'organizationId', v_target.id,
      'organizationName', v_target.name,
      'membershipRole', p_target_role
    )::text,
    left(p_ip_address, 80),
    left(p_user_agent, 512),
    coalesce(p_device_type, 'unknown')
  );

  RETURN jsonb_build_object(
    'success', true,
    'userId', p_user_id,
    'fromOrganizationId', v_source.id,
    'toOrganizationId', v_target.id,
    'previousRole', v_previous_role,
    'newRole', p_target_role,
    'sessionRevoked', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.transfer_employee_to_organization(
  integer, uuid, public.organization_member_role, integer, text, text, text,
  text, text, text, text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.transfer_employee_to_organization(
  integer, uuid, public.organization_member_role, integer, text, text, text,
  text, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.transfer_employee_to_organization(
  integer, uuid, public.organization_member_role, integer, text, text, text,
  text, text, text, text
) IS
  'Atomically transfers an active employee between organizations, updates scoped membership and device registration, revokes existing sessions, and appends an immutable audit event.';
