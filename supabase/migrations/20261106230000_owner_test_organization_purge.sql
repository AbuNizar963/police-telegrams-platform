-- Owner-only physical purge for archived organizations.
-- Normal organization deletion remains logical and append-only audit logs remain protected.

CREATE TABLE IF NOT EXISTS public.audit_purge_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationCode" varchar(120) NOT NULL,
  "organizationName" varchar(255) NOT NULL,
  "organizationIdHash" varchar(64) NOT NULL,
  "ownerUserId" integer NOT NULL,
  reason text NOT NULL,
  "deletedCounts" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.audit_purge_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_purge_receipts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.purge_archived_organization_safely(
  p_organization_id uuid,
  p_owner_user_id integer,
  p_reason text,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_organization public.organizations%ROWTYPE;
  v_owner public.users%ROWTYPE;
  v_auth_ids uuid[];
  v_counts jsonb;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'A purge reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_owner
    FROM public.users
   WHERE id = p_owner_user_id
   FOR UPDATE;
  IF NOT FOUND OR v_owner.role <> 'admin'::public.user_role
     OR v_owner."isPlatformOwner" IS NOT TRUE OR v_owner."isActive" IS NOT TRUE THEN
    RAISE EXCEPTION 'Only an active platform owner may purge test data' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_organization
    FROM public.organizations
   WHERE id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_organization."deletedAt" IS NULL OR v_organization."isActive" IS TRUE THEN
    RAISE EXCEPTION 'Organization must be archived before purge' USING ERRCODE = '22023';
  END IF;
  IF v_organization.type = 'central'::public.organization_type
     OR v_organization."parentOrganizationId" IS NULL THEN
    RAISE EXCEPTION 'The central/root organization cannot be purged' USING ERRCODE = '23514';
  END IF;
  IF p_confirmation <> 'DELETE ' || v_organization.code || ' PERMANENTLY' THEN
    RAISE EXCEPTION 'Invalid purge confirmation' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations child WHERE child."parentOrganizationId" = p_organization_id) THEN
    RAISE EXCEPTION 'Move or delete child organizations first' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.telegrams
    WHERE "organizationId" = p_organization_id OR "currentOrganizationId" = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Organization still has telegrams' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.telegram_routes
    WHERE "fromOrganizationId" = p_organization_id OR "toOrganizationId" = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Organization still has routes' USING ERRCODE = '23503';
  END IF;

  SELECT coalesce(array_agg("authUserId"), ARRAY[]::uuid[])
    INTO v_auth_ids
    FROM public.users
   WHERE "organizationId" = p_organization_id AND "authUserId" IS NOT NULL;

  v_counts := jsonb_build_object(
    'users', (SELECT count(*) FROM public.users WHERE "organizationId" = p_organization_id),
    'memberships', (SELECT count(*) FROM public.organization_memberships WHERE "organizationId" = p_organization_id),
    'settings', (SELECT count(*) FROM public.department_settings WHERE "organizationId" = p_organization_id),
    'auditLogs', (SELECT count(*) FROM public.audit_logs WHERE "organizationId" = p_organization_id OR "actorUserId" IN (SELECT id FROM public.users WHERE "organizationId" = p_organization_id)),
    'organization', 1
  );

  -- This setting is transaction-local. Only this SECURITY DEFINER function can
  -- activate the audit trigger's maintenance exception.
  PERFORM set_config('app.audit_purge_mode', 'approved', true);

  DELETE FROM public.telegram_attachments
   WHERE "storageOrganizationId" = p_organization_id
      OR "uploadedByUserId" IN (SELECT id FROM public.users WHERE "organizationId" = p_organization_id);
  DELETE FROM public.notifications WHERE "organizationId" = p_organization_id OR "userId" IN (SELECT id FROM public.users WHERE "organizationId" = p_organization_id);
  DELETE FROM public.push_subscriptions WHERE "organizationId" = p_organization_id OR "userId" IN (SELECT id FROM public.users WHERE "organizationId" = p_organization_id);
  DELETE FROM public.mobile_push_tokens WHERE "organizationId" = p_organization_id OR "userId" IN (SELECT id FROM public.users WHERE "organizationId" = p_organization_id);
  DELETE FROM public.department_settings WHERE "organizationId" = p_organization_id;
  DELETE FROM public.organization_memberships WHERE "organizationId" = p_organization_id OR "userId" IN (SELECT id FROM public.users WHERE "organizationId" = p_organization_id);
  DELETE FROM public.audit_logs WHERE "organizationId" = p_organization_id OR "actorUserId" IN (SELECT id FROM public.users WHERE "organizationId" = p_organization_id);
  DELETE FROM public.users WHERE "organizationId" = p_organization_id;
  DELETE FROM auth.users WHERE id = ANY(v_auth_ids);
  DELETE FROM public.organizations WHERE id = p_organization_id;

  INSERT INTO public.audit_purge_receipts (
    "organizationCode", "organizationName", "organizationIdHash", "ownerUserId", reason, "deletedCounts"
  ) VALUES (
    v_organization.code,
    v_organization.name,
    encode(extensions.digest(p_organization_id::text, 'sha256'), 'hex'),
    p_owner_user_id,
    left(btrim(p_reason), 2000),
    v_counts
  );

  RETURN jsonb_build_object(
    'deleted', true,
    'organizationId', p_organization_id,
    'organizationCode', v_organization.code,
    'deletedCounts', v_counts
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.audit_purge_mode', true) = 'approved' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only: UPDATE, DELETE and TRUNCATE are prohibited'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.purge_archived_organization_safely(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_archived_organization_safely(uuid, integer, text, text) TO service_role;


CREATE TABLE IF NOT EXISTS public.user_purge_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userIdHash" varchar(64) NOT NULL,
  "organizationIdHash" varchar(64) NOT NULL,
  "ownerUserId" integer NOT NULL,
  reason text NOT NULL,
  "deletedCounts" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.user_purge_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_purge_receipts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.purge_inactive_user_safely(
  p_user_id integer,
  p_owner_user_id integer,
  p_reason text,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $function$
DECLARE
  v_owner public.users%ROWTYPE;
  v_user public.users%ROWTYPE;
  v_auth_id uuid;
  v_counts jsonb;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'A purge reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_owner FROM public.users WHERE id = p_owner_user_id FOR UPDATE;
  IF NOT FOUND OR v_owner.role <> 'admin'::public.user_role
     OR v_owner."isPlatformOwner" IS NOT TRUE OR v_owner."isActive" IS NOT TRUE THEN
    RAISE EXCEPTION 'Only an active platform owner may purge accounts' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = p_owner_user_id THEN
    RAISE EXCEPTION 'The current owner account cannot be purged' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_user."isPlatformOwner" IS TRUE OR v_user.role = 'admin'::public.user_role THEN
    RAISE EXCEPTION 'Platform administrator accounts cannot be purged' USING ERRCODE = '42501';
  END IF;
  IF v_user."isActive" IS TRUE OR coalesce(v_user."loginMethod", '') <> 'disabled' THEN
    RAISE EXCEPTION 'Account must be disabled before purge' USING ERRCODE = '22023';
  END IF;
  IF p_confirmation <> 'DELETE USER ' || p_user_id::text || ' PERMANENTLY' THEN
    RAISE EXCEPTION 'Invalid account purge confirmation' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.telegrams WHERE "createdByUserId" = p_user_id) THEN
    RAISE EXCEPTION 'Account still owns telegrams' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.telegram_routes
    WHERE "forwardedByUserId" = p_user_id OR "approvedByUserId" = p_user_id OR "receiverDecisionByUserId" = p_user_id
  ) THEN
    RAISE EXCEPTION 'Account still owns route decisions' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM public.telegram_actions WHERE "actorUserId" = p_user_id)
     OR EXISTS (SELECT 1 FROM public.telegram_versions WHERE "changedByUserId" = p_user_id)
     OR EXISTS (SELECT 1 FROM public.telegram_attachments WHERE "uploadedByUserId" = p_user_id) THEN
    RAISE EXCEPTION 'Account still owns operational history' USING ERRCODE = '23503';
  END IF;

  v_auth_id := v_user."authUserId";
  v_counts := jsonb_build_object(
    'users', 1,
    'memberships', (SELECT count(*) FROM public.organization_memberships WHERE "userId" = p_user_id),
    'notifications', (SELECT count(*) FROM public.notifications WHERE "userId" = p_user_id),
    'auditLogs', (SELECT count(*) FROM public.audit_logs WHERE "actorUserId" = p_user_id)
  );

  PERFORM set_config('app.audit_purge_mode', 'approved', true);
  DELETE FROM public.notifications WHERE "userId" = p_user_id;
  DELETE FROM public.push_subscriptions WHERE "userId" = p_user_id;
  DELETE FROM public.mobile_push_tokens WHERE "userId" = p_user_id;
  DELETE FROM public.organization_memberships WHERE "userId" = p_user_id;
  DELETE FROM public.audit_logs WHERE "actorUserId" = p_user_id;
  DELETE FROM public.users WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = v_auth_id;

  INSERT INTO public.user_purge_receipts (
    "userIdHash", "organizationIdHash", "ownerUserId", reason, "deletedCounts"
  ) VALUES (
    encode(extensions.digest(p_user_id::text, 'sha256'), 'hex'),
    encode(extensions.digest(v_user."organizationId"::text, 'sha256'), 'hex'),
    p_owner_user_id,
    left(btrim(p_reason), 2000),
    v_counts
  );

  RETURN jsonb_build_object('deleted', true, 'userId', p_user_id, 'deletedCounts', v_counts);
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_inactive_user_safely(integer, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_inactive_user_safely(integer, integer, text, text) TO service_role;
