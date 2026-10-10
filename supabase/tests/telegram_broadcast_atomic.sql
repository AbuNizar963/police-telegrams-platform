BEGIN;

SELECT plan(8);

SELECT has_function(
  'public',
  'route_telegram_broadcast_atomic',
  ARRAY['integer', 'uuid', 'uuid', 'integer', 'text', 'jsonb'],
  'atomic broadcast routing function exists'
);

INSERT INTO public.organizations (
  code,
  name,
  type,
  "parentOrganizationId"
)
SELECT
  target.code,
  target.name,
  'department'::public.organization_type,
  source.id
FROM (
  VALUES
    ('TEST-BROADCAST-CHILD-A', 'Atomic Broadcast Child A'),
    ('TEST-BROADCAST-CHILD-B', 'Atomic Broadcast Child B'),
    ('TEST-BROADCAST-NOT-CHILD', 'Atomic Broadcast Non-child')
) AS target(code, name)
JOIN public.organizations AS source ON source.code = 'LEGACY-PRIMARY';

INSERT INTO public.department_settings (
  "configKey",
  "organizationId",
  "departmentName"
)
SELECT
  'atomic-broadcast:' || organization.code,
  organization.id,
  organization.name
FROM public.organizations AS organization
WHERE organization.code IN (
  'LEGACY-PRIMARY',
  'TEST-BROADCAST-CHILD-A',
  'TEST-BROADCAST-CHILD-B',
  'TEST-BROADCAST-NOT-CHILD'
)
ON CONFLICT ("organizationId") DO NOTHING;

-- Put the invalid target under a different parent so the atomic function must
-- fail only after it has already routed the primary telegram and first copy.
UPDATE public.organizations AS invalid_target
SET "parentOrganizationId" = other_parent.id
FROM public.organizations AS other_parent
WHERE invalid_target.code = 'TEST-BROADCAST-NOT-CHILD'
  AND other_parent.code = 'TEST-BROADCAST-CHILD-A';

INSERT INTO public.users (
  "authUserId",
  name,
  "loginMethod",
  "organizationId"
)
SELECT
  '00000000-0000-4000-8000-000000009301'::uuid,
  'TEST-BROADCAST-ACTOR',
  'atomic-broadcast-test',
  source.id
FROM public.organizations AS source
WHERE source.code = 'LEGACY-PRIMARY';

INSERT INTO public.organization_memberships (
  "organizationId",
  "userId",
  role
)
SELECT
  source.id,
  actor.id,
  'dispatcher'::public.organization_member_role
FROM public.organizations AS source
JOIN public.users AS actor ON actor.name = 'TEST-BROADCAST-ACTOR'
WHERE source.code = 'LEGACY-PRIMARY'
ON CONFLICT ("organizationId", "userId") DO NOTHING;

INSERT INTO public.telegrams (
  "serialNumber",
  "serialCode",
  "createdByUserId",
  "creatorName",
  subject,
  recipient,
  body,
  classification,
  priority,
  category,
  status,
  "organizationId",
  "currentOrganizationId"
)
SELECT
  9300001,
  'TEST-BROADCAST-ATOMIC-9300001',
  actor.id,
  actor.name,
  'Atomic broadcast success',
  'Direct child organizations',
  'Atomic broadcast test',
  'normal',
  'normal',
  'administrative',
  'draft',
  source.id,
  source.id
FROM public.users AS actor
JOIN public.organizations AS source ON source.code = 'LEGACY-PRIMARY'
WHERE actor.name = 'TEST-BROADCAST-ACTOR';

SELECT lives_ok(
  $$
    SELECT public.route_telegram_broadcast_atomic(
      telegram.id,
      source.id,
      child_a.id,
      actor.id,
      'atomic broadcast success test',
      jsonb_build_array(
        jsonb_build_object(
          'targetOrganizationId', child_b.id,
          'serialNumber', 9300002,
          'serialCode', 'TEST-BROADCAST-COPY-9300002',
          'organizationSerialNumber', 9300002,
          'organizationSerialCode', 'TEST-BROADCAST-ORG-9300002',
          'verificationToken', gen_random_uuid(),
          'creatorName', actor.name,
          'creatorEmail', null,
          'creatorBadgeId', null,
          'creatorIp', null,
          'creatorFingerprint', actor."authUserId",
          'subject', 'Atomic broadcast success',
          'recipient', 'Direct child organizations',
          'body', 'Atomic broadcast test copy',
          'classification', 'normal',
          'priority', 'normal',
          'category', 'administrative'
        )
      )
    )
    FROM public.telegrams AS telegram
    JOIN public.organizations AS source ON source.code = 'LEGACY-PRIMARY'
    JOIN public.organizations AS child_a ON child_a.code = 'TEST-BROADCAST-CHILD-A'
    JOIN public.organizations AS child_b ON child_b.code = 'TEST-BROADCAST-CHILD-B'
    JOIN public.users AS actor ON actor.name = 'TEST-BROADCAST-ACTOR'
    WHERE telegram."serialCode" = 'TEST-BROADCAST-ATOMIC-9300001'
  $$,
  'valid broadcast routes the primary telegram and creates/routes its copy'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.telegram_routes AS route
    JOIN public.telegrams AS telegram ON telegram.id = route."telegramId"
    WHERE telegram."serialCode" IN (
      'TEST-BROADCAST-ATOMIC-9300001',
      'TEST-BROADCAST-COPY-9300002'
    )
  ),
  2,
  'successful broadcast commits both routes'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.telegrams
    WHERE "serialCode" = 'TEST-BROADCAST-COPY-9300002'
  ),
  1,
  'successful broadcast commits its copy'
);

INSERT INTO public.telegrams (
  "serialNumber",
  "serialCode",
  "createdByUserId",
  "creatorName",
  subject,
  recipient,
  body,
  classification,
  priority,
  category,
  status,
  "organizationId",
  "currentOrganizationId"
)
SELECT
  9300010,
  'TEST-BROADCAST-ROLLBACK-9300010',
  actor.id,
  actor.name,
  'Atomic broadcast rollback',
  'Direct child organizations',
  'Atomic rollback test',
  'normal',
  'normal',
  'administrative',
  'draft',
  source.id,
  source.id
FROM public.users AS actor
JOIN public.organizations AS source ON source.code = 'LEGACY-PRIMARY'
WHERE actor.name = 'TEST-BROADCAST-ACTOR';

SELECT throws_ok(
  $$
    SELECT public.route_telegram_broadcast_atomic(
      telegram.id,
      source.id,
      child_a.id,
      actor.id,
      'atomic broadcast rollback test',
      jsonb_build_array(
        jsonb_build_object(
          'targetOrganizationId', child_b.id,
          'serialNumber', 9300011,
          'serialCode', 'TEST-BROADCAST-ROLLBACK-COPY-9300011',
          'organizationSerialNumber', 9300011,
          'organizationSerialCode', 'TEST-BROADCAST-ORG-9300011',
          'verificationToken', gen_random_uuid(),
          'creatorName', actor.name,
          'creatorEmail', null,
          'creatorBadgeId', null,
          'creatorIp', null,
          'creatorFingerprint', actor."authUserId",
          'subject', 'Atomic broadcast rollback',
          'recipient', 'Direct child organizations',
          'body', 'First copy must roll back',
          'classification', 'normal',
          'priority', 'normal',
          'category', 'administrative'
        ),
        jsonb_build_object(
          'targetOrganizationId', invalid_target.id,
          'serialNumber', 9300012,
          'serialCode', 'TEST-BROADCAST-ROLLBACK-COPY-9300012',
          'organizationSerialNumber', 9300012,
          'organizationSerialCode', 'TEST-BROADCAST-ORG-9300012',
          'verificationToken', gen_random_uuid(),
          'creatorName', actor.name,
          'creatorEmail', null,
          'creatorBadgeId', null,
          'creatorIp', null,
          'creatorFingerprint', actor."authUserId",
          'subject', 'Atomic broadcast rollback',
          'recipient', 'Direct child organizations',
          'body', 'Invalid target should abort the transaction',
          'classification', 'normal',
          'priority', 'normal',
          'category', 'administrative'
        )
      )
    )
    FROM public.telegrams AS telegram
    JOIN public.organizations AS source ON source.code = 'LEGACY-PRIMARY'
    JOIN public.organizations AS child_a ON child_a.code = 'TEST-BROADCAST-CHILD-A'
    JOIN public.organizations AS child_b ON child_b.code = 'TEST-BROADCAST-CHILD-B'
    JOIN public.organizations AS invalid_target ON invalid_target.code = 'TEST-BROADCAST-NOT-CHILD'
    JOIN public.users AS actor ON actor.name = 'TEST-BROADCAST-ACTOR'
    WHERE telegram."serialCode" = 'TEST-BROADCAST-ROLLBACK-9300010'
  $$,
  '42501',
  'Every broadcast target must be an active direct child',
  'an invalid later target aborts the entire broadcast transaction'
);

SELECT is(
  (
    SELECT status::text
    FROM public.telegrams
    WHERE "serialCode" = 'TEST-BROADCAST-ROLLBACK-9300010'
  ),
  'draft',
  'failed broadcast leaves the primary telegram as a draft'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.telegram_routes AS route
    JOIN public.telegrams AS telegram ON telegram.id = route."telegramId"
    WHERE telegram."serialCode" = 'TEST-BROADCAST-ROLLBACK-9300010'
  ),
  0,
  'failed broadcast leaves no route on the primary telegram'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.telegrams
    WHERE "serialCode" IN (
      'TEST-BROADCAST-ROLLBACK-COPY-9300011',
      'TEST-BROADCAST-ROLLBACK-COPY-9300012'
    )
  ),
  0,
  'failed broadcast rolls back every copy inserted earlier in the transaction'
);

SELECT * FROM finish();
ROLLBACK;
