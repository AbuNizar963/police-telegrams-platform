begin;

select plan(8);

create temporary table owner_workplace_test_context (
  root_organization_id uuid not null,
  target_organization_id uuid not null,
  user_id integer
) on commit drop;

with root as (
  select id
  from public.organizations
  where code = 'LEGACY-PRIMARY'
  limit 1
), target as (
  insert into public.organizations (
    code,
    name,
    type,
    "parentOrganizationId"
  )
  select
    'PGTAP-OWNER-WORKPLACE',
    'جهة اختبار اختيار مكان عمل المالك',
    'department',
    root.id
  from root
  returning id
)
insert into owner_workplace_test_context (
  root_organization_id,
  target_organization_id
)
select root.id, target.id
from root cross join target;

with test_user as (
  insert into public.users (
    "authUserId",
    "organizationId",
    username,
    email,
    "loginMethod",
    "isPlatformOwner",
    role
  )
  select
    gen_random_uuid(),
    root_organization_id,
    'pgtap_owner_workplace',
    null,
    'password',
    true,
    'admin'
  from owner_workplace_test_context
  returning id
)
update owner_workplace_test_context context
set user_id = test_user.id
from test_user;

select public.set_owner_workplace(
  (select user_id from owner_workplace_test_context),
  (select root_organization_id from owner_workplace_test_context)
);

select throws_ok(
  $$
    insert into public.organization_memberships (
      "organizationId",
      "userId",
      role,
      "isActive"
    )
    select
      target_organization_id,
      user_id,
      'organization_admin',
      true
    from owner_workplace_test_context
  $$,
  '42501',
  'Owner membership changes require the owner workplace selector',
  'direct membership assignment cannot create an extra active owner membership'
);

select ok(
  not exists (
    select 1
    from public.organizations
    where code = 'ALSHAHBAA'
  )
  or exists (
    select 1
    from public.organizations shahbaa
    join public.organizations parent
      on parent.id = shahbaa."parentOrganizationId"
    where shahbaa.code = 'ALSHAHBAA'
      and parent.code = 'GOV-ALEPPO'
  ),
  'Shahbaa stays under Aleppo when the production hierarchy is seeded'
);

select public.set_owner_workplace(
  (select user_id from owner_workplace_test_context),
  (select target_organization_id from owner_workplace_test_context)
);

select is(
  (
    select count(*)
    from public.organization_memberships
    where "userId" = (select user_id from owner_workplace_test_context)
      and "isActive" = true
  ),
  1::bigint,
  'owner has exactly one active workplace'
);

select is(
  (
    select "organizationId"
    from public.organization_memberships
    where "userId" = (select user_id from owner_workplace_test_context)
      and "isActive" = true
    limit 1
  ),
  (select target_organization_id from owner_workplace_test_context),
  'owner has exactly the requested active workplace'
);

select is(
  (
    select role::text
    from public.organization_memberships
    where "userId" = (select user_id from owner_workplace_test_context)
      and "isActive" = true
    limit 1
  ),
  'system_admin'::text,
  'owner keeps system administration rights in the selected workplace'
);

select is(
  (
    select "organizationId"
    from public.users
    where id = (select user_id from owner_workplace_test_context)
    limit 1
  ),
  (select root_organization_id from owner_workplace_test_context),
  'switching workplace does not change the owner home organization'
);

select is(
  (
    select count(*)
    from public.organization_memberships
    where "userId" = (select user_id from owner_workplace_test_context)
      and "organizationId" = (select root_organization_id from owner_workplace_test_context)
      and "isActive" = true
  ),
  0::bigint,
  'the previous root membership is inactive after switching'
);

select is(
  (
    select count(*)
    from public.audit_logs
    where "actorUserId" = (select user_id from owner_workplace_test_context)
      and action = 'owner.workplace.select'
  ),
  2::bigint,
  'workplace changes are recorded in the audit log'
);

select * from finish();
rollback;
