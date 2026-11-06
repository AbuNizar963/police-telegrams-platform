-- Read-only, owner-validated aggregate for the platform operations dashboard.
-- The tRPC route validates the owner identity; this SECURITY DEFINER function
-- repeats the check and is executable only by the server's service role.
DROP FUNCTION IF EXISTS public.owner_dashboard_summary(integer, integer);

CREATE OR REPLACE FUNCTION public.owner_dashboard_summary(
  p_owner_user_id integer,
  p_days integer DEFAULT 30,
  p_configured_owner_username text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_days integer := p_days;
  v_generated_at timestamptz := statement_timestamp();
  v_from timestamptz;
BEGIN
  IF p_days IS NULL OR p_days NOT BETWEEN 7 AND 90 THEN
    RAISE EXCEPTION 'Dashboard period must be between 7 and 90 days'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.users AS owner_account
     WHERE owner_account.id = p_owner_user_id
       AND owner_account.role = 'admin'::public.user_role
       AND owner_account."isActive" IS TRUE
       AND (
         owner_account."isPlatformOwner" IS TRUE
         OR (
           NULLIF(btrim(p_configured_owner_username), '') IS NOT NULL
           AND lower(btrim(owner_account.username)) = lower(btrim(p_configured_owner_username))
         )
       )
  ) THEN
    RAISE EXCEPTION 'Only an active platform owner can read platform dashboard data'
      USING ERRCODE = '42501';
  END IF;

  v_from := date_trunc('day', v_generated_at) - make_interval(days => v_days - 1);

  RETURN (
    WITH scoped_events AS MATERIALIZED (
      SELECT
        'audit:' || event.id::text AS event_id,
        event."createdAt" AS created_at,
        event.action,
        event."actorName" AS actor_name,
        event."organizationId"::text AS organization_key,
        CASE
          WHEN event."organizationId" IS NULL THEN 'النظام'
          ELSE COALESCE(organization.name, 'جهة مؤرشفة')
        END AS organization_name,
        event."entityType" AS entity_type,
        event."entityId" AS entity_id,
        (
          event.action IN (
            'telegram.delete',
            'organization.delete',
            'organization.purge',
            'organization.purge_archived',
            'user.disable',
            'user.enable',
            'user.delete'
          )
          OR event.action LIKE '%purge%'
          OR event.action LIKE '%permanent%'
        ) AS is_sensitive
      FROM public.audit_logs AS event
      LEFT JOIN public.organizations AS organization
        ON organization.id = event."organizationId"
      WHERE event."createdAt" >= v_from
        AND event."createdAt" <= v_generated_at

      UNION ALL

      SELECT
        'purge:' || receipt.id::text AS event_id,
        receipt."createdAt" AS created_at,
        'organization.purge_archived'::text AS action,
        COALESCE(owner_account.name, owner_account.username, 'مالك النظام') AS actor_name,
        'purge:' || receipt."organizationIdHash" AS organization_key,
        receipt."organizationName" AS organization_name,
        'organization'::text AS entity_type,
        receipt."organizationCode" AS entity_id,
        true AS is_sensitive
      FROM public.audit_purge_receipts AS receipt
      LEFT JOIN public.users AS owner_account
        ON owner_account.id = receipt."ownerUserId"
      WHERE receipt."createdAt" >= v_from
        AND receipt."createdAt" <= v_generated_at
    ),
    daily_rollup AS (
      SELECT date_trunc('day', event.created_at) AS day,
             count(*) AS operation_count
        FROM scoped_events AS event
       GROUP BY date_trunc('day', event.created_at)
    ),
    category_rollup AS (
      SELECT CASE
               WHEN event.action LIKE 'telegram.%' THEN 'telegram'
               WHEN event.action LIKE 'user.%' THEN 'user'
               WHEN event.action LIKE 'organization.%' THEN 'organization'
               WHEN event.action LIKE 'platform.%' OR event.action LIKE 'settings.%' THEN 'platform'
               ELSE 'other'
             END AS category,
             count(*) AS operation_count
        FROM scoped_events AS event
       GROUP BY 1
    ),
    organization_rollup AS (
      SELECT event.organization_key,
             event.organization_name,
             count(*) AS operation_count
        FROM scoped_events AS event
       WHERE event.organization_key IS NOT NULL
       GROUP BY event.organization_key, event.organization_name
    )
    SELECT jsonb_build_object(
      'periodDays', v_days,
      'from', v_from,
      'generatedAt', v_generated_at,
      'totalOperations', (SELECT count(*) FROM scoped_events),
      'sensitiveOperations', (
        SELECT count(*)
          FROM scoped_events
         WHERE is_sensitive IS TRUE
      ),
      'activeOrganizations', (
        SELECT count(*)
          FROM public.organizations AS organization
         WHERE organization."isActive" IS TRUE
           AND organization."deletedAt" IS NULL
      ),
      'activeUsers', (
        SELECT count(*)
          FROM public.users AS account
         WHERE account."isActive" IS TRUE
      ),
      'operationsByDay', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'date', to_char(calendar.day, 'YYYY-MM-DD'),
              'count', COALESCE(daily.operation_count, 0)
            )
            ORDER BY calendar.day
          ),
          '[]'::jsonb
        )
          FROM generate_series(
            date_trunc('day', v_from),
            date_trunc('day', v_generated_at),
            interval '1 day'
          ) AS calendar(day)
          LEFT JOIN daily_rollup AS daily ON daily.day = calendar.day
      ),
      'operationsByCategory', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'category', category_rollup.category,
              'count', category_rollup.operation_count
            )
            ORDER BY category_rollup.operation_count DESC, category_rollup.category
          ),
          '[]'::jsonb
        )
          FROM category_rollup
      ),
      'topOrganizations', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'organizationName', ranked.organization_name,
              'count', ranked.operation_count
            )
            ORDER BY ranked.operation_count DESC, ranked.organization_name
          ),
          '[]'::jsonb
        )
          FROM (
            SELECT organization_rollup.organization_name,
                   organization_rollup.operation_count
              FROM organization_rollup
             ORDER BY organization_rollup.operation_count DESC,
                      organization_rollup.organization_name
             LIMIT 5
          ) AS ranked
      ),
      'recentOperations', (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', recent.event_id,
              'createdAt', recent.created_at,
              'action', recent.action,
              'actorName', recent.actor_name,
              'organizationName', recent.organization_name,
              'entityType', recent.entity_type,
              'entityId', recent.entity_id
            )
            ORDER BY recent.created_at DESC, recent.event_id DESC
          ),
          '[]'::jsonb
        )
          FROM (
            SELECT event_id,
                   created_at,
                   action,
                   actor_name,
                   organization_name,
                   entity_type,
                   entity_id
              FROM scoped_events
             ORDER BY created_at DESC, event_id DESC
             LIMIT 8
          ) AS recent
      )
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_dashboard_summary(integer, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_dashboard_summary(integer, integer, text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
