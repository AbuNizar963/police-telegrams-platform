BEGIN;

SELECT plan(11);

SELECT has_function(
  'public',
  'transfer_employee_to_organization',
  ARRAY[
    'integer',
    'uuid',
    'public.organization_member_role',
    'integer',
    'text',
    'text',
    'text',
    'text',
    'text',
    'text',
    'text'
  ],
  'atomic employee transfer procedure exists'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.transfer_employee_to_organization(integer, uuid, public.organization_member_role, integer, text, text, text, text, text, text, text)',
    'EXECUTE'
  ),
  'anon cannot call employee transfer directly'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.transfer_employee_to_organization(integer, uuid, public.organization_member_role, integer, text, text, text, text, text, text, text)',
    'EXECUTE'
  ),
  'authenticated cannot call employee transfer directly'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.transfer_employee_to_organization(integer, uuid, public.organization_member_role, integer, text, text, text, text, text, text, text)',
    'EXECUTE'
  ),
  'trusted server role can call employee transfer'
);

CREATE TEMP TABLE employee_transfer_test_context (
  source_organization_id uuid NOT NULL,
  target_organization_id uuid NOT NULL,
  actor_user_id integer NOT NULL,
  employee_user_id integer NOT NULL,
  previous_auth_user_id uuid NOT NULL
) ON COMMIT DROP;

WITH root AS (
  SELECT id FROM public.organizations WHERE code = 'LEGACY-PRIMARY' LIMIT 1
),
source_org AS (
  INSERT INTO public.organizations (
    code, name, type, "parentOrganizationId"
  )
  SELECT
    'PGTAP-EMP-TRANSFER-SOURCE',
    'جهة اختبار نقل الموظف - المصدر',
    'department',
    root.id
  FROM root
  RETURNING id
),
target_org AS (
  INSERT INTO public.organizations (
    code, name, type, "parentOrganizationId"
  )
  SELECT
    'PGTAP-EMP-TRANSFER-TARGET',
    'جهة اختبار نقل الموظف - الوجهة',
    'department',
    root.id
  FROM root
  RETURNING id
),
actor AS (
  INSERT INTO public.users (
    "authUserId", "organizationId", username, name, password_hash,
    "loginMethod", "isPlatformOwner", role
  )
  SELECT
    gen_random_uuid(), root.id, 'pgtap_employee_transfer_owner',
    'مالك اختبار النقل', 'unused-hash', 'password', true, 'admin'
  FROM root
  RETURNING id
),
employee AS (
  INSERT INTO public.users (
    "authUserId", "organizationId", username, name, password_hash,
    "loginMethod", role
  )
  SELECT
    gen_random_uuid(), source_org.id, 'pgtap_employee_transfer_user',
    'موظف اختبار النقل', 'unused-hash', 'password', 'user'
  FROM source_org
  RETURNING id, "authUserId"
)
INSERT INTO employee_transfer_test_context (
  source_organization_id,
  target_organization_id,
  actor_user_id,
  employee_user_id,
  previous_auth_user_id
)
SELECT source_org.id, target_org.id, actor.id, employee.id, employee."authUserId"
FROM source_org
CROSS JOIN target_org
CROSS JOIN actor
CROSS JOIN employee;

INSERT INTO public.organization_memberships (
  "organizationId", "userId", role, "isActive"
)
SELECT
  source_organization_id,
  employee_user_id,
  'dispatcher',
  true
FROM employee_transfer_test_context;

SELECT lives_ok(
  format(
    'SELECT public.transfer_employee_to_organization(%s, %L::uuid, %L::public.organization_member_role, %s, %L, NULL, %L, %L, NULL, NULL, %L)',
    employee_user_id,
    target_organization_id,
    'reviewer',
    actor_user_id,
    'مالك اختبار النقل',
    'admin',
    'قرار إداري تجريبي لنقل الموظف',
    'desktop'
  ),
  'employee transfer succeeds atomically'
)
FROM employee_transfer_test_context;

SELECT is(
  (
    SELECT "organizationId"
    FROM public.users
    WHERE id = (SELECT employee_user_id FROM employee_transfer_test_context)
  ),
  (SELECT target_organization_id FROM employee_transfer_test_context),
  'employee canonical organization changes to destination'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.organization_memberships
    WHERE "userId" = (SELECT employee_user_id FROM employee_transfer_test_context)
      AND "organizationId" = (SELECT source_organization_id FROM employee_transfer_test_context)
      AND "isActive" = true
  ),
  0::bigint,
  'previous organization membership is deactivated'
);

SELECT is(
  (
    SELECT role::text
    FROM public.organization_memberships
    WHERE "userId" = (SELECT employee_user_id FROM employee_transfer_test_context)
      AND "organizationId" = (SELECT target_organization_id FROM employee_transfer_test_context)
      AND "isActive" = true
  ),
  'reviewer'::text,
  'destination membership receives the approved role'
);

SELECT ok(
  (
    SELECT account."authUserId" <> context.previous_auth_user_id
    FROM public.users account
    CROSS JOIN employee_transfer_test_context context
    WHERE account.id = context.employee_user_id
  ),
  'existing employee sessions are revoked after transfer'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.audit_logs audit
    JOIN employee_transfer_test_context context
      ON audit."entityId" = context.employee_user_id::text
    WHERE audit.action = 'employee.transfer'
      AND audit."actorUserId" = context.actor_user_id
      AND audit."organizationId" = context.target_organization_id
      AND audit.reason = 'قرار إداري تجريبي لنقل الموظف'
      AND audit."beforeState" LIKE '%' || context.source_organization_id::text || '%'
      AND audit."afterState" LIKE '%' || context.target_organization_id::text || '%'
      AND audit."entryHash" IS NOT NULL
  ),
  'transfer is recorded in the immutable audit chain with before/after snapshots'
);

SELECT throws_ok(
  format(
    'SELECT public.transfer_employee_to_organization(%s, %L::uuid, %L::public.organization_member_role, %s, %L, NULL, %L, %L, NULL, NULL, %L)',
    employee_user_id,
    source_organization_id,
    'dispatcher',
    employee_user_id,
    'موظف اختبار النقل',
    'user',
    'محاولة نقل ذاتية غير مسموحة',
    'desktop'
  ),
  '42501',
  'An administrator cannot transfer their own account',
  'employee cannot self-authorize a transfer'
)
FROM employee_transfer_test_context;

SELECT * FROM finish();
ROLLBACK;
