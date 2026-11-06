-- Guarded permanent deletion. This is intentionally separate from logical archiving.
-- Every remaining application-schema FK reference blocks deletion; no CASCADE is used.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.get_permanent_delete_blockers(
  p_target_table regclass,
  p_target_id text,
  p_ignored_tables text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_constraint record;
  v_count bigint;
  v_blockers jsonb := '[]'::jsonb;
BEGIN
  FOR v_constraint IN
    SELECT
      source_ns.nspname AS source_schema,
      source_table.relname AS source_table,
      target_ns.nspname AS target_schema,
      target_table.relname AS target_table,
      source_column.attname AS source_column,
      target_column.attname AS target_column,
      constraint_row.conname AS constraint_name,
      cardinality(constraint_row.conkey) AS source_key_count,
      cardinality(constraint_row.confkey) AS target_key_count
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS source_table
      ON source_table.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS source_ns
      ON source_ns.oid = source_table.relnamespace
    JOIN pg_catalog.pg_class AS target_table
      ON target_table.oid = constraint_row.confrelid
    JOIN pg_catalog.pg_namespace AS target_ns
      ON target_ns.oid = target_table.relnamespace
    LEFT JOIN pg_catalog.pg_attribute AS source_column
      ON source_column.attrelid = source_table.oid
     AND source_column.attnum = constraint_row.conkey[1]
    LEFT JOIN pg_catalog.pg_attribute AS target_column
      ON target_column.attrelid = constraint_row.confrelid
     AND target_column.attnum = constraint_row.confkey[1]
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = p_target_table
      AND source_ns.nspname NOT IN (
        'pg_catalog',
        'information_schema',
        'pg_toast'
      )
      AND (source_ns.nspname || '.' || source_table.relname)
        <> ALL(p_ignored_tables)
    ORDER BY source_table.relname, constraint_row.conname
  LOOP
    IF v_constraint.source_key_count <> 1
       OR v_constraint.target_key_count <> 1
       OR v_constraint.source_column IS NULL
       OR v_constraint.target_column IS NULL THEN
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'table', v_constraint.source_schema || '.' || v_constraint.source_table,
        'column', coalesce(v_constraint.source_column, 'مفتاح مركب'),
        'constraint', v_constraint.constraint_name,
        'count', null,
        'reason', 'تعذر فحص علاقة مركبة تلقائياً؛ الحذف ممنوع احتياطياً'
      ));
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM %I.%I AS source WHERE EXISTS (' ||
      'SELECT 1 FROM %I.%I AS target WHERE target.%I::text = $1 ' ||
      'AND source.%I IS NOT DISTINCT FROM target.%I)',
      v_constraint.source_schema,
      v_constraint.source_table,
      v_constraint.target_schema,
      v_constraint.target_table,
      'id',
      v_constraint.source_column,
      v_constraint.target_column
    )
    INTO v_count
    USING p_target_id;

    IF v_count > 0 THEN
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'table', v_constraint.source_schema || '.' || v_constraint.source_table,
        'column', v_constraint.source_column,
        'constraint', v_constraint.constraint_name,
        'count', v_count,
        'reason', 'توجد سجلات مرتبطة يجب الحفاظ عليها'
      ));
    END IF;
  END LOOP;

  RETURN v_blockers;
END;
$function$;

REVOKE ALL ON FUNCTION private.get_permanent_delete_blockers(regclass, text, text[])
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.inspect_organization_permanent_delete(
  p_organization_id uuid,
  p_actor_user_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_organization public.organizations%ROWTYPE;
  v_blockers jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_actor_user_id
      AND "isPlatformOwner" = true
      AND "isActive" = true
  ) THEN
    RAISE EXCEPTION 'Only an active platform owner may inspect permanent deletion'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_organization
  FROM public.organizations
  WHERE id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_organization.type = 'central'::public.organization_type
     OR v_organization."parentOrganizationId" IS NULL THEN
    RETURN jsonb_build_object(
      'canDelete', false,
      'reason', 'لا يمكن حذف الجهة المركزية أو الجذر التنظيمي',
      'blockers', '[]'::jsonb
    );
  END IF;

  IF v_organization."deletedAt" IS NULL THEN
    RETURN jsonb_build_object(
      'canDelete', false,
      'reason', 'يجب إخفاء الجهة أولاً قبل طلب الحذف النهائي',
      'blockers', '[]'::jsonb
    );
  END IF;

  v_blockers := private.get_permanent_delete_blockers(
    'public.organizations'::regclass,
    p_organization_id::text,
    ARRAY[
      'public.organization_memberships',
      'public.push_subscriptions',
      'public.mobile_push_tokens'
    ]
  );

  RETURN jsonb_build_object(
    'canDelete', jsonb_array_length(v_blockers) = 0,
    'reason', CASE WHEN jsonb_array_length(v_blockers) = 0
      THEN 'لا توجد علاقات مرجعية تمنع الحذف؛ ستُزال بيانات الإشعارات والأجهزة المؤقتة فقط'
      ELSE 'تعذر الحذف النهائي لوجود سجلات مرتبطة يجب الاحتفاظ بها'
    END,
    'blockers', v_blockers
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_organization_permanently(
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
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_organization public.organizations%ROWTYPE;
  v_blockers jsonb;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'A deletion reason of at least 8 characters is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_actor_user_id
      AND "isPlatformOwner" = true
      AND "isActive" = true
  ) THEN
    RAISE EXCEPTION 'Only an active platform owner may permanently delete organizations'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_organization
  FROM public.organizations
  WHERE id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_organization.type = 'central'::public.organization_type
     OR v_organization."parentOrganizationId" IS NULL THEN
    RAISE EXCEPTION 'The central/root organization cannot be permanently deleted'
      USING ERRCODE = '23514';
  END IF;

  IF v_organization."deletedAt" IS NULL THEN
    RAISE EXCEPTION 'Archive the organization before permanent deletion'
      USING ERRCODE = '22023';
  END IF;

  v_blockers := private.get_permanent_delete_blockers(
    'public.organizations'::regclass,
    p_organization_id::text,
    ARRAY['organization_memberships', 'push_subscriptions', 'mobile_push_tokens']
  );

  IF jsonb_array_length(v_blockers) > 0 THEN
    RETURN jsonb_build_object(
      'deleted', false,
      'canDelete', false,
      'reason', 'توجد سجلات مرتبطة؛ لم يتم حذف أي بيانات',
      'blockers', v_blockers
    );
  END IF;

  DELETE FROM public.organization_memberships
   WHERE "organizationId" = p_organization_id;
  DELETE FROM public.push_subscriptions
   WHERE "organizationId" = p_organization_id;
  DELETE FROM public.mobile_push_tokens
   WHERE "organizationId" = p_organization_id;

  DELETE FROM public.organizations WHERE id = p_organization_id;

  INSERT INTO public.audit_logs (
    "actorUserId", "actorName", "actorRank", "actorRole",
    "organizationId", action, "entityType", "entityId", metadata,
    reason, "beforeState", "afterState", "ipAddress", "userAgent", "deviceType"
  ) VALUES (
    p_actor_user_id,
    left(coalesce(nullif(btrim(p_actor_name), ''), 'مالك النظام'), 255),
    p_actor_rank, p_actor_role, p_organization_id,
    'organization.purge', 'organization', p_organization_id::text,
    jsonb_build_object(
      'organizationId', p_organization_id,
      'organizationCode', v_organization.code,
      'organizationName', v_organization.name,
      'organizationType', v_organization.type,
      'deletionMode', 'permanent'
    )::text,
    left(btrim(p_reason), 2000),
    jsonb_build_object(
      'id', v_organization.id,
      'code', v_organization.code,
      'name', v_organization.name,
      'type', v_organization.type,
      'deletedAt', v_organization."deletedAt"
    )::text,
    jsonb_build_object('deleted', true, 'auditHistoryRetained', true)::text,
    left(p_ip_address, 80), left(p_user_agent, 512),
    coalesce(p_device_type, 'unknown')
  );

  RETURN jsonb_build_object(
    'deleted', true,
    'organizationId', p_organization_id,
    'auditHistoryRetained', true,
    'blockers', '[]'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.inspect_user_permanent_delete(
  p_user_id integer,
  p_actor_user_id integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_user public.users%ROWTYPE;
  v_blockers jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_actor_user_id
      AND "isPlatformOwner" = true
      AND "isActive" = true
  ) THEN
    RAISE EXCEPTION 'Only an active platform owner may inspect permanent account deletion'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_user."isPlatformOwner" OR v_user.role = 'admin'::public.user_role THEN
    RETURN jsonb_build_object(
      'canDelete', false,
      'reason', 'لا يمكن حذف حساب مالك النظام',
      'blockers', '[]'::jsonb
    );
  END IF;

  IF v_user."isActive" AND v_user."loginMethod" IS DISTINCT FROM 'disabled' THEN
    RETURN jsonb_build_object(
      'canDelete', false,
      'reason', 'عطّل الحساب أولاً قبل طلب الحذف النهائي',
      'blockers', '[]'::jsonb
    );
  END IF;

  v_blockers := private.get_permanent_delete_blockers(
    'public.users'::regclass,
    p_user_id::text,
    ARRAY[
      'public.organization_memberships',
      'public.push_subscriptions',
      'public.mobile_push_tokens',
      'public.department_settings',
      'public.platform_document_settings'
    ]
  );

  RETURN jsonb_build_object(
    'canDelete', jsonb_array_length(v_blockers) = 0,
    'reason', CASE WHEN jsonb_array_length(v_blockers) = 0
      THEN 'لا توجد سجلات تاريخية مرتبطة؛ يمكن حذف الحساب بعد التأكيد'
      ELSE 'الحساب مرتبط بسجلات تاريخية يجب الاحتفاظ بها'
    END,
    'blockers', v_blockers
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_user_permanently(
  p_user_id integer,
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
SET search_path = pg_catalog, public, private
AS $function$
DECLARE
  v_user public.users%ROWTYPE;
  v_blockers jsonb;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'A deletion reason of at least 8 characters is required'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_actor_user_id
      AND "isPlatformOwner" = true
      AND "isActive" = true
  ) THEN
    RAISE EXCEPTION 'Only an active platform owner may permanently delete accounts'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = p_actor_user_id THEN
    RAISE EXCEPTION 'The current owner account cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_user."isPlatformOwner" OR v_user.role = 'admin'::public.user_role THEN
    RAISE EXCEPTION 'Platform owner accounts cannot be permanently deleted'
      USING ERRCODE = '42501';
  END IF;

  IF v_user."isActive" AND v_user."loginMethod" IS DISTINCT FROM 'disabled' THEN
    RAISE EXCEPTION 'Disable the account before permanent deletion'
      USING ERRCODE = '22023';
  END IF;

  v_blockers := private.get_permanent_delete_blockers(
    'public.users'::regclass,
    p_user_id::text,
    ARRAY[
      'organization_memberships',
      'push_subscriptions',
      'mobile_push_tokens',
      'department_settings',
      'platform_document_settings'
    ]
  );

  IF jsonb_array_length(v_blockers) > 0 THEN
    RETURN jsonb_build_object(
      'deleted', false,
      'canDelete', false,
      'reason', 'توجد سجلات مرتبطة؛ لم يتم حذف أي بيانات',
      'blockers', v_blockers
    );
  END IF;

  DELETE FROM public.organization_memberships WHERE "userId" = p_user_id;
  DELETE FROM public.push_subscriptions WHERE "userId" = p_user_id;
  DELETE FROM public.mobile_push_tokens WHERE "userId" = p_user_id;
  UPDATE public.department_settings
     SET "updatedByUserId" = NULL
   WHERE "updatedByUserId" = p_user_id;
  UPDATE public.platform_document_settings
     SET "updatedByUserId" = NULL
   WHERE "updatedByUserId" = p_user_id;

  DELETE FROM public.users WHERE id = p_user_id;

  INSERT INTO public.audit_logs (
    "actorUserId", "actorName", "actorRank", "actorRole",
    action, "entityType", "entityId", metadata, reason,
    "beforeState", "afterState", "ipAddress", "userAgent", "deviceType"
  ) VALUES (
    p_actor_user_id,
    left(coalesce(nullif(btrim(p_actor_name), ''), 'مالك النظام'), 255),
    p_actor_rank, p_actor_role,
    'user.purge', 'user', p_user_id::text,
    jsonb_build_object(
      'deletedUserId', p_user_id,
      'deletedUsername', v_user.username,
      'deletionMode', 'permanent'
    )::text,
    left(btrim(p_reason), 2000),
    jsonb_build_object(
      'id', v_user.id,
      'username', v_user.username,
      'name', v_user.name,
      'organizationId', v_user."organizationId"
    )::text,
    jsonb_build_object('deleted', true, 'auditHistoryRetained', true)::text,
    left(p_ip_address, 80), left(p_user_agent, 512),
    coalesce(p_device_type, 'unknown')
  );

  RETURN jsonb_build_object(
    'deleted', true,
    'userId', p_user_id,
    'auditHistoryRetained', true,
    'blockers', '[]'::jsonb
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.inspect_organization_permanent_delete(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_organization_permanently(uuid, integer, text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inspect_user_permanent_delete(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_user_permanently(integer, integer, text, text, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.inspect_organization_permanent_delete(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_organization_permanently(uuid, integer, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.inspect_user_permanent_delete(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_user_permanently(integer, integer, text, text, text, text, text, text, text) TO service_role;
