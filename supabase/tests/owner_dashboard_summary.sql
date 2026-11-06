BEGIN;
SELECT plan(10);

CREATE TEMP TABLE owner_dashboard_test_context (
  organization_id uuid NOT NULL,
  owner_user_id integer NOT NULL,
  regular_user_id integer NOT NULL,
  configured_owner_id integer NOT NULL,
  configured_owner_username text NOT NULL
) ON COMMIT DROP;

WITH new_organization AS (
  INSERT INTO public.organizations (code, name, type)
  VALUES (
    'PGTAP-OWNER-DASH-' || substr(gen_random_uuid()::text, 1, 8),
    'جهة اختبار لوحة المالك',
    'department'
  )
  RETURNING id
), owner_account AS (
  INSERT INTO public.users (
    "authUserId", "organizationId", username, "loginMethod", "isPlatformOwner", role
  )
  SELECT gen_random_uuid(), new_organization.id, 'pgtap_owner_dash_' || substr(gen_random_uuid()::text, 1, 8), 'local', true, 'admin'
    FROM new_organization
  RETURNING id, "organizationId"
), regular_account AS (
  INSERT INTO public.users (
    "authUserId", "organizationId", username, "loginMethod", "isPlatformOwner", role
  )
  SELECT gen_random_uuid(), owner_account."organizationId", 'pgtap_user_dash_' || substr(gen_random_uuid()::text, 1, 8), 'local', false, 'admin'
    FROM owner_account
  RETURNING id
), configured_owner AS (
  INSERT INTO public.users (
    "authUserId", "organizationId", username, "loginMethod", "isPlatformOwner", role
  )
  SELECT gen_random_uuid(), owner_account."organizationId", 'pgtap_owner_fallback_' || substr(gen_random_uuid()::text, 1, 8), 'local', false, 'admin'
    FROM owner_account
  RETURNING id, username
)
INSERT INTO owner_dashboard_test_context (
  organization_id,
  owner_user_id,
  regular_user_id,
  configured_owner_id,
  configured_owner_username
)
SELECT owner_account."organizationId",
       owner_account.id,
       regular_account.id,
       configured_owner.id,
       configured_owner.username
  FROM owner_account
 CROSS JOIN regular_account
 CROSS JOIN configured_owner;

INSERT INTO public.audit_logs (
  "actorUserId", "actorName", "organizationId", action, "entityType", "entityId", "createdAt"
)
SELECT context.owner_user_id, 'مالك اختبار اللوحة', context.organization_id, activity.action, activity.entity_type, activity.entity_id, activity.created_at
  FROM owner_dashboard_test_context AS context
 CROSS JOIN (
   VALUES
     ('telegram.create'::varchar, 'telegram'::varchar, '101'::varchar, now() - interval '1 hour'),
     ('user.disable'::varchar, 'user'::varchar, '102'::varchar, now() - interval '1 day'),
     ('telegram.create'::varchar, 'telegram'::varchar, '103'::varchar, now() - interval '10 days')
 ) AS activity(action, entity_type, entity_id, created_at);

INSERT INTO public.audit_purge_receipts (
  "organizationCode", "organizationName", "organizationIdHash", "ownerUserId", reason, "deletedCounts", "createdAt"
)
SELECT 'PGTAP-PURGED-' || substr(gen_random_uuid()::text, 1, 8),
       'جهة محذوفة للاختبار',
       substr(md5(gen_random_uuid()::text) || md5(now()::text), 1, 64),
       owner_user_id,
       'اختبار تجميع إيصال الحذف الدائم',
       '{}'::jsonb,
       now() - interval '1 minute'
  FROM owner_dashboard_test_context;

SELECT is(
  (public.owner_dashboard_summary((SELECT owner_user_id FROM owner_dashboard_test_context), 7, NULL) ->> 'periodDays')::integer,
  7,
  'the requested period is returned'
);

SELECT is(
  (public.owner_dashboard_summary((SELECT owner_user_id FROM owner_dashboard_test_context), 7, NULL) ->> 'totalOperations')::integer,
  3,
  'audit events and permanent-purge receipts inside the period are counted'
);

SELECT is(
  (public.owner_dashboard_summary((SELECT owner_user_id FROM owner_dashboard_test_context), 7, NULL) ->> 'sensitiveOperations')::integer,
  2,
  'sensitive account changes and permanent purges are counted'
);

SELECT is(
  jsonb_array_length(public.owner_dashboard_summary((SELECT owner_user_id FROM owner_dashboard_test_context), 7, NULL) -> 'operationsByDay'),
  7,
  'the daily chart includes every calendar day in the selected period'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM jsonb_array_elements(public.owner_dashboard_summary((SELECT owner_user_id FROM owner_dashboard_test_context), 7, NULL) -> 'operationsByCategory') AS category(item)
     WHERE category.item ->> 'category' = 'telegram'
       AND (category.item ->> 'count')::integer = 1
  )
  AND EXISTS (
    SELECT 1
      FROM jsonb_array_elements(public.owner_dashboard_summary((SELECT owner_user_id FROM owner_dashboard_test_context), 7, NULL) -> 'operationsByCategory') AS category(item)
     WHERE category.item ->> 'category' = 'organization'
       AND (category.item ->> 'count')::integer = 1
  ),
  'audit activity and purge receipts are categorized in the same aggregate'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM jsonb_array_elements(public.owner_dashboard_summary((SELECT owner_user_id FROM owner_dashboard_test_context), 7, NULL) -> 'topOrganizations') AS organization(item)
     WHERE organization.item ->> 'organizationName' = 'جهة اختبار لوحة المالك'
       AND (organization.item ->> 'count')::integer = 2
  ),
  'the most active organization is identified by its audit activity'
);

SELECT is(
  jsonb_array_length(public.owner_dashboard_summary((SELECT owner_user_id FROM owner_dashboard_test_context), 7, NULL) -> 'recentOperations'),
  3,
  'the recent activity list includes audit events and purge receipts in the period'
);

SELECT ok(
  EXISTS (
    SELECT 1
      FROM jsonb_array_elements(public.owner_dashboard_summary((SELECT owner_user_id FROM owner_dashboard_test_context), 7, NULL) -> 'recentOperations') AS operation(item)
     WHERE operation.item ->> 'action' = 'organization.purge_archived'
       AND operation.item ->> 'organizationName' = 'جهة محذوفة للاختبار'
  ),
  'permanent-purge receipts have an identifiable owner-facing activity label and organization'
);

SELECT is(
  (public.owner_dashboard_summary(
    (SELECT configured_owner_id FROM owner_dashboard_test_context),
    7,
    (SELECT configured_owner_username FROM owner_dashboard_test_context)
  ) ->> 'periodDays')::integer,
  7,
  'the configured owner fallback matches the server-side owner identity rule'
);

SELECT throws_ok(
  $$
    SELECT public.owner_dashboard_summary(
      (SELECT regular_user_id FROM owner_dashboard_test_context),
      7,
      (SELECT configured_owner_username FROM owner_dashboard_test_context)
    )
  $$,
  '42501',
  'Only an active platform owner can read platform dashboard data',
  'an administrator without platform-owner status cannot read the aggregate'
);

SELECT * FROM finish();
ROLLBACK;
