-- Owner-only logical deletion for organizations. Rows are retained as tombstones
-- so immutable audit history and historical telegram references remain valid.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.organizations."deletedAt" IS
  'Timestamp when a platform owner logically deleted this organization; the row remains for historical references.';
COMMENT ON COLUMN public.users."isActive" IS
  'When false, the account cannot authenticate or access the application; the user row remains as an audit reference.';

CREATE OR REPLACE FUNCTION public.archive_organization_safely(
  p_organization_id uuid,
  p_actor_user_id integer,
  p_actor_name text,
  p_reason text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_type text DEFAULT 'unknown',
  p_actor_rank text DEFAULT NULL,
  p_actor_role text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_organization public.organizations%ROWTYPE;
  v_accounts jsonb;
  v_account_count integer;
  v_admin_authorized boolean;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A deletion reason is required'
      USING ERRCODE = '22023';
  END IF;

  -- The RPC is executable only by service_role; the server route performs the
  -- strict isPlatformOwner/configured-owner check before calling it. Keep the
  -- database-side actor check independent of the configured username fallback.
  SELECT EXISTS (
    SELECT 1
    FROM public.users AS actor
    WHERE actor.id = p_actor_user_id
      AND actor.role = 'admin'::public.user_role
      AND actor."isActive" = true
  ) INTO v_admin_authorized;
  IF NOT v_admin_authorized THEN
    RAISE EXCEPTION 'Only an active platform administrator may execute this procedure'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_organization
    FROM public.organizations
   WHERE id = p_organization_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_organization."deletedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Organization has already been deleted'
      USING ERRCODE = '22023';
  END IF;
  IF v_organization.type = 'central'::public.organization_type
     OR v_organization."parentOrganizationId" IS NULL THEN
    RAISE EXCEPTION 'The central/root organization cannot be deleted'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organizations AS child
    WHERE child."parentOrganizationId" = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Move or delete child organizations first'
      USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organizations AS source
    WHERE source.id <> p_organization_id
      AND source."telegramDestinationOrganizationId" = p_organization_id
      AND source."deletedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'Change active organizations'' configured destination first'
      USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.organization_memberships AS membership
    JOIN public.users AS account ON account.id = membership."userId"
    WHERE membership."organizationId" = p_organization_id
      AND account."isPlatformOwner" = true
      AND membership."isActive" = true
  ) THEN
    RAISE EXCEPTION 'Move the platform owner''s workplace before deleting this organization'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.users AS owner
    WHERE owner."organizationId" = p_organization_id
      AND owner."isPlatformOwner" = true
      AND owner."isActive" = true
  ) THEN
    RAISE EXCEPTION 'Move the platform owner''s home organization before deleting this organization'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.users AS actor
    WHERE actor.id = p_actor_user_id
      AND actor."organizationId" = p_organization_id
  ) THEN
    RAISE EXCEPTION 'The owner must switch to a different home organization first'
      USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', account.id,
        'username', account.username,
        'name', account.name,
        'role', account.role,
        'isActive', account."isActive"
      ) ORDER BY account.id
    ),
    '[]'::jsonb
  )
    INTO v_accounts
    FROM public.users AS account
   WHERE account."organizationId" = p_organization_id;

  SELECT count(*)::integer
    INTO v_account_count
    FROM public.users AS account
   WHERE account."organizationId" = p_organization_id
     AND account."isPlatformOwner" = false;

  -- Disable direct accounts and invalidate existing sessions. Keep the user
  -- rows and IDs: immutable audit rows reference them by foreign key.
  UPDATE public.users AS account
     SET "isActive" = false,
         "loginMethod" = 'disabled',
         password_hash = NULL,
         username = NULL,
         email = NULL,
         phone = NULL,
         "badgeNumber" = NULL,
         bio = NULL,
         rank = NULL,
         unit = NULL,
         "avatarKey" = NULL,
         "mustChangePassword" = false,
         "updatedAt" = clock_timestamp()
   WHERE account."organizationId" = p_organization_id
     AND account."isPlatformOwner" = false;

  UPDATE public.organization_memberships
     SET "isActive" = false,
         "updatedAt" = clock_timestamp()
   WHERE "organizationId" = p_organization_id
      OR "userId" IN (
        SELECT account.id
        FROM public.users AS account
        WHERE account."organizationId" = p_organization_id
          AND account."isPlatformOwner" = false
      );

  DELETE FROM public.push_subscriptions AS subscription
   USING public.users AS account
   WHERE subscription."userId" = account.id
     AND account."organizationId" = p_organization_id
     AND account."isPlatformOwner" = false;

  DELETE FROM public.mobile_push_tokens AS token
   USING public.users AS account
   WHERE token."userId" = account.id
     AND account."organizationId" = p_organization_id
     AND account."isPlatformOwner" = false;

  UPDATE public.organizations
     SET "isActive" = false,
         "deletedAt" = clock_timestamp(),
         "updatedAt" = clock_timestamp()
   WHERE id = p_organization_id;

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
  ) VALUES (
    p_actor_user_id,
    left(coalesce(nullif(btrim(p_actor_name), ''), 'مالك النظام'), 255),
    p_actor_rank,
    p_actor_role,
    p_organization_id,
    'organization.deleted',
    'organization',
    p_organization_id::text,
    jsonb_build_object(
      'organizationId', p_organization_id,
      'organizationCode', v_organization.code,
      'organizationName', v_organization.name,
      'organizationType', v_organization.type,
      'archivedAccountCount', v_account_count,
      'deletionMode', 'logical'
    )::text,
    left(btrim(p_reason), 2000),
    jsonb_build_object(
      'organization', jsonb_build_object(
        'id', v_organization.id,
        'code', v_organization.code,
        'name', v_organization.name,
        'type', v_organization.type,
        'parentOrganizationId', v_organization."parentOrganizationId",
        'isActive', v_organization."isActive"
      ),
      'accounts', v_accounts
    )::text,
    jsonb_build_object(
      'deleted', true,
      'organizationId', p_organization_id,
      'accountsDisabled', v_account_count,
      'auditHistoryRetained', true
    )::text,
    left(p_ip_address, 80),
    left(p_user_agent, 512),
    coalesce(p_device_type, 'unknown')
  );

  RETURN jsonb_build_object(
    'organizationId', p_organization_id,
    'accountsDisabled', v_account_count,
    'deleted', true,
    'auditHistoryRetained', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_organization_safely(
  uuid, integer, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_organization_safely(
  uuid, integer, text, text, text, text, text, text, text
) TO service_role;
