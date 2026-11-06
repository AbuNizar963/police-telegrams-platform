BEGIN;

SELECT plan(10);

SELECT has_function(
  'public',
  'archive_organization_safely',
  ARRAY['uuid', 'integer', 'text', 'text', 'text', 'text', 'text', 'text', 'text'],
  'owner organization archive procedure exists'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.archive_organization_safely(uuid, integer, text, text, text, text, text, text, text)',
    'EXECUTE'
  ),
  'anon cannot call the archive procedure'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.archive_organization_safely(uuid, integer, text, text, text, text, text, text, text)',
    'EXECUTE'
  ),
  'authenticated cannot call the archive procedure directly'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.archive_organization_safely(uuid, integer, text, text, text, text, text, text, text)',
    'EXECUTE'
  ),
  'server service role can call the archive procedure'
);

INSERT INTO public.organizations (code, name, type, "parentOrganizationId")
SELECT 'TEST-DELETE-STATION', 'Delete Test Station', 'station', id
FROM public.organizations
WHERE code = 'LEGACY-PRIMARY';

INSERT INTO public.organizations (code, name, type, "parentOrganizationId")
SELECT 'TEST-DELETE-UNIT', 'Delete Test Unit', 'unit', id
FROM public.organizations
WHERE code = 'TEST-DELETE-STATION';

INSERT INTO public.users (
  "authUserId", "organizationId", username, name, password_hash,
  "loginMethod", "isPlatformOwner", role
)
SELECT gen_random_uuid(), id, 'test-owner-delete', 'Test Owner', 'unused-hash',
       'password', true, 'admin'
FROM public.organizations
WHERE code = 'LEGACY-PRIMARY';

INSERT INTO public.users (
  "authUserId", "organizationId", username, name, password_hash,
  "loginMethod", role
)
SELECT gen_random_uuid(), id, 'test-unit-delete', 'Test Unit Account', 'unused-hash',
       'password', 'user'
FROM public.organizations
WHERE code = 'TEST-DELETE-UNIT';

INSERT INTO public.organization_memberships ("organizationId", "userId", role)
SELECT organization.id, account.id, 'dispatcher'
FROM public.organizations AS organization
JOIN public.users AS account
  ON account.username = 'test-unit-delete'
WHERE organization.code = 'TEST-DELETE-UNIT';

SELECT throws_ok(
  format(
    'SELECT public.archive_organization_safely(%L::uuid, %s, %L, %L)',
    organization.id,
    owner.id,
    'Test Owner',
    'root deletion must fail'
  ),
  '23514',
  'The central/root organization cannot be deleted',
  'root organization deletion is blocked'
)
FROM public.organizations AS organization
CROSS JOIN public.users AS owner
WHERE organization.code = 'LEGACY-PRIMARY'
  AND owner.username = 'test-owner-delete';

SELECT lives_ok(
  format(
    'SELECT public.archive_organization_safely(%L::uuid, %s, %L, %L, NULL, NULL, %L, NULL, %L)',
    organization.id,
    owner.id,
    'Test Owner',
    'delete empty test organization',
    'desktop',
    'admin'
  ),
  'an owner can archive a leaf organization atomically'
)
FROM public.organizations AS organization
CROSS JOIN public.users AS owner
WHERE organization.code = 'TEST-DELETE-UNIT'
  AND owner.username = 'test-owner-delete';

SELECT is(
  (
    SELECT organization."isActive" = false
       AND organization."deletedAt" IS NOT NULL
    FROM public.organizations AS organization
    WHERE organization.code = 'TEST-DELETE-UNIT'
  ),
  true,
  'organization is logically deleted and deactivated'
);

SELECT is(
  (
    SELECT account."isActive" = false
       AND account."loginMethod" = 'disabled'
       AND account.username IS NULL
       AND account.password_hash IS NULL
    FROM public.users AS account
    WHERE account.name = 'Test Unit Account'
  ),
  true,
  'direct account credentials are disabled while the user row remains'
);

SELECT is(
  (
    SELECT membership."isActive" = false
    FROM public.organization_memberships AS membership
    JOIN public.users AS account ON account.id = membership."userId"
    WHERE account.name = 'Test Unit Account'
  ),
  true,
  'organization membership is disabled'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.audit_logs AS audit
    JOIN public.organizations AS organization
      ON audit."entityId" = organization.id::text
    WHERE organization.code = 'TEST-DELETE-UNIT'
      AND audit.action = 'organization.deleted'
      AND audit."beforeState" LIKE '%test-unit-delete%'
      AND audit."afterState" LIKE '%auditHistoryRetained%'
      AND audit."entryHash" IS NOT NULL
  ),
  'deletion is retained in the immutable audit chain with a before-state snapshot'
);

SELECT * FROM finish();
ROLLBACK;
