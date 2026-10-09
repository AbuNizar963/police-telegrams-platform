begin;

select plan(19);

select has_function(
  'public',
  'route_telegram',
  array['integer', 'uuid', 'uuid', 'integer', 'text'],
  'atomic route function exists'
);

select has_function(
  'public',
  'receive_telegram_route',
  array['integer', 'integer'],
  'route receipt function exists'
);

insert into public.organizations (
  code,
  name,
  type,
  "parentOrganizationId"
)
select
  route_org.code,
  route_org.name,
  route_org.type::public.organization_type,
  parent.id
from (
  values
    ('TEST-ROUTE-GOV-A', 'Test Governorate A', 'governorate', 'LEGACY-PRIMARY'),
    ('TEST-ROUTE-GOV-B', 'Test Governorate B', 'governorate', 'LEGACY-PRIMARY')
) as route_org(code, name, type, parent_code)
join public.organizations as parent on parent.code = route_org.parent_code;

insert into public.department_settings (
  "configKey",
  "organizationId",
  "departmentName"
)
select
  'route-test:' || organization.code,
  organization.id,
  organization.name
from public.organizations as organization
where organization.code in ('TEST-ROUTE-GOV-A', 'TEST-ROUTE-GOV-B');

insert into public.organizations (
  code,
  name,
  type,
  "parentOrganizationId"
)
select
  route_org.code,
  route_org.name,
  route_org.type::public.organization_type,
  parent.id
from (
  values
    ('TEST-ROUTE-UNIT-A', 'Test Unit A', 'department', 'TEST-ROUTE-GOV-A'),
    ('TEST-ROUTE-UNIT-B', 'Test Unit B', 'department', 'TEST-ROUTE-GOV-B')
) as route_org(code, name, type, parent_code)
join public.organizations as parent on parent.code = route_org.parent_code;

insert into public.organizations (
  code,
  name,
  type,
  "parentOrganizationId"
)
select route_org.code,
       route_org.name,
       route_org.type::public.organization_type,
       parent.id
from (
  values ('TEST-ROUTE-STATION-A', 'Test Station A', 'station', 'TEST-ROUTE-UNIT-A')
) as route_org(code, name, type, parent_code)
join public.organizations as parent on parent.code = route_org.parent_code;

insert into public.department_settings (
  "configKey",
  "organizationId",
  "departmentName"
)
select 'route-test:' || organization.code,
       organization.id,
       organization.name
from public.organizations as organization
where organization.code = 'TEST-ROUTE-UNIT-A';

insert into public.users (
  "authUserId",
  name,
  "loginMethod",
  "organizationId"
)
select
  gen_random_uuid(),
  route_user.name,
  'route-lifecycle-test',
  organization.id
from (
  values
    ('TEST-ROUTE-ACTOR', 'Test Route Actor', 'TEST-ROUTE-UNIT-A'),
    ('TEST-ROUTE-STATION-ACTOR', 'Test Station Actor', 'TEST-ROUTE-STATION-A'),
    ('TEST-ROUTE-SECTION-APPROVER', 'Test Department A Approver', 'TEST-ROUTE-UNIT-A'),
    ('TEST-ROUTE-APPROVER-A', 'Test Governorate A Approver', 'TEST-ROUTE-GOV-A'),
    ('TEST-ROUTE-APPROVER-B', 'Test Governorate B Approver', 'TEST-ROUTE-GOV-B'),
    ('TEST-ROUTE-RECEIVER-B', 'Test Route Receiver', 'TEST-ROUTE-UNIT-B')
) as route_user(code, name, organization_code)
join public.organizations as organization on organization.code = route_user.organization_code;

insert into public.organization_memberships (
  "organizationId",
  "userId",
  role
)
select
  organization.id,
  user_row.id,
  membership.role::public.organization_member_role
from (
  values
    ('Test Route Actor', 'TEST-ROUTE-UNIT-A', 'dispatcher'),
    ('Test Station Actor', 'TEST-ROUTE-STATION-A', 'dispatcher'),
    ('Test Department A Approver', 'TEST-ROUTE-UNIT-A', 'reviewer'),
    ('Test Governorate A Approver', 'TEST-ROUTE-GOV-A', 'reviewer'),
    ('Test Governorate B Approver', 'TEST-ROUTE-GOV-B', 'reviewer'),
    ('Test Route Receiver', 'TEST-ROUTE-UNIT-B', 'dispatcher')
) as membership(user_name, organization_code, role)
join public.users as user_row on user_row.name = membership.user_name
join public.organizations as organization on organization.code = membership.organization_code;

insert into public.telegrams (
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
select
  9100001,
  'TEST-ROUTE-DIRECT-9100001',
  actor.id,
  actor.name,
  'Direct hierarchy route',
  'Test Governorate A',
  'Direct route test message',
  'normal',
  'normal',
  'administrative',
  'approved',
  unit_a.id,
  unit_a.id
from public.users as actor
join public.organizations as unit_a on unit_a.code = 'TEST-ROUTE-UNIT-A'
where actor.name = 'Test Route Actor';

select lives_ok(
  $$
    select public.route_telegram(
      telegram.id,
      unit_a.id,
      governorate_a.id,
      actor.id,
      'direct hierarchy handoff'
    )
    from public.telegrams as telegram
    join public.organizations as unit_a on unit_a.code = 'TEST-ROUTE-UNIT-A'
    join public.organizations as governorate_a on governorate_a.code = 'TEST-ROUTE-GOV-A'
    join public.users as actor on actor.name = 'Test Route Actor'
    where telegram."serialCode" = 'TEST-ROUTE-DIRECT-9100001'
  $$,
  'direct hierarchy route is accepted'
);

select results_eq(
  $$
    select status::text || ':' || "currentOrganizationId"::text
    from public.telegrams
    where "serialCode" = 'TEST-ROUTE-DIRECT-9100001'
  $$,
  $$
    select 'approved:' || id::text
    from public.organizations
    where code = 'TEST-ROUTE-UNIT-A'
  $$,
  'direct route remains at the source while approval is pending'
);

select ok(
  exists (
    select 1
    from public.telegram_actions as action
    join public.telegrams as telegram on telegram.id = action."telegramId"
    where telegram."serialCode" = 'TEST-ROUTE-DIRECT-9100001'
      and action.action = 'telegram.route.requested'
      and action."toStatus" = 'approved'
  ),
  'direct route records a pending lifecycle action'
);

select lives_ok(
  $$
    select public.approve_telegram_route(
      route.id,
      approver.id,
      true,
      'اعتماد السلطة الأعلى للمسار المباشر'
    )
    from public.telegram_routes as route
    join public.telegrams as telegram on telegram.id = route."telegramId"
    join public.users as approver on approver.name = 'Test Governorate A Approver'
    where telegram."serialCode" = 'TEST-ROUTE-DIRECT-9100001'
  $$,
  'higher authority approves the direct route'
);
select ok(
  exists (
    select 1
    from public.telegram_routes as route
    join public.telegrams as telegram on telegram.id = route."telegramId"
    where telegram."serialCode" = 'TEST-ROUTE-DIRECT-9100001'
      and route."approvalStatus" = 'approved'
      and route."routeSerialCode" is not null
      and telegram.status = 'forwarded'
  ),
  'approval transfers the telegram and assigns a new route serial'
);

insert into public.telegrams (
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
select
  9100002,
  'TEST-ROUTE-APPROVAL-9100002',
  actor.id,
  actor.name,
  'Cross-governorate route',
  'Test Unit B',
  'Cross-governorate route test message',
  'normal',
  'urgent',
  'security',
  'approved',
  station_a.id,
  station_a.id
from public.users as actor
join public.organizations as station_a on station_a.code = 'TEST-ROUTE-STATION-A'
where actor.name = 'Test Station Actor';

select lives_ok(
  $$
    select public.route_telegram(
      telegram.id,
      station_a.id,
      unit_b.id,
      actor.id,
      'requires immediate-parent approval'
    )
    from public.telegrams as telegram
    join public.organizations as station_a on station_a.code = 'TEST-ROUTE-STATION-A'
    join public.organizations as unit_b on unit_b.code = 'TEST-ROUTE-UNIT-B'
    join public.users as actor on actor.name = 'Test Station Actor'
    where telegram."serialCode" = 'TEST-ROUTE-APPROVAL-9100002'
  $$,
  'cross-governorate route creates an approval request'
);

select results_eq(
  $$
    select route."approvalStatus" || ':' || telegram.status::text || ':' || telegram."currentOrganizationId"::text
    from public.telegram_routes as route
    join public.telegrams as telegram on telegram.id = route."telegramId"
    where telegram."serialCode" = 'TEST-ROUTE-APPROVAL-9100002'
  $$,
  $$
    select 'pending:approved:' || id::text
    from public.organizations
    where code = 'TEST-ROUTE-STATION-A'
  $$,
  'pending approval leaves the telegram at its source without a status change'
);

select throws_ok(
  $$
    select public.approve_telegram_route(
      route.id,
      wrong_approver.id,
      true,
      'unauthorized approval'
    )
    from public.telegram_routes as route
    join public.telegrams as telegram on telegram.id = route."telegramId"
    join public.users as wrong_approver on wrong_approver.name = 'Test Governorate A Approver'
    where telegram."serialCode" = 'TEST-ROUTE-APPROVAL-9100002'
  $$,
  '42501',
  'Only the immediate higher authority may decide this route',
  'the governorate ancestor cannot approve a station route owned by its direct parent section'
);

select throws_ok(
  $$
    select public.decide_telegram_route_receiver(
      route.id,
      receiver.id,
      true,
      null
    )
    from public.telegram_routes as route
    join public.telegrams as telegram on telegram.id = route."telegramId"
    join public.users as receiver on receiver.name = 'Test Route Receiver'
    where telegram."serialCode" = 'TEST-ROUTE-APPROVAL-9100002'
  $$,
  '22023',
  'Route is not awaiting receiver decision',
  'receiver cannot decide while higher-authority approval is pending'
);

select lives_ok(
  $$
    select public.approve_telegram_route(
      route.id,
      approver.id,
      true,
      'approved by the direct-parent city section'
    )
    from public.telegram_routes as route
    join public.telegrams as telegram on telegram.id = route."telegramId"
    join public.users as approver on approver.name = 'Test Department A Approver'
    where telegram."serialCode" = 'TEST-ROUTE-APPROVAL-9100002'
  $$,
  'immediate-parent department approval is accepted'
);

select ok(
  exists (
    select 1
    from public.telegram_actions as action
    join public.telegrams as telegram on telegram.id = action."telegramId"
    join public.organizations as unit_b on unit_b.id = telegram."currentOrganizationId"
    where telegram."serialCode" = 'TEST-ROUTE-APPROVAL-9100002'
      and telegram.status = 'forwarded'
      and unit_b.code = 'TEST-ROUTE-UNIT-B'
      and action.action = 'telegram.route.approved'
  ),
  'approval atomically transfers responsibility and writes an action'
);

select lives_ok(
  $$
    select public.receive_telegram_route(route.id, receiver.id)
    from public.telegram_routes as route
    join public.telegrams as telegram on telegram.id = route."telegramId"
    join public.users as receiver on receiver.name = 'Test Route Receiver'
    where telegram."serialCode" = 'TEST-ROUTE-APPROVAL-9100002'
  $$,
  'destination dispatcher can receive an approved route'
);

select ok(
  exists (
    select 1
    from public.telegram_routes as route
    join public.telegrams as telegram on telegram.id = route."telegramId"
    where telegram."serialCode" = 'TEST-ROUTE-APPROVAL-9100002'
      and route.status = 'received'
      and route."receivedAt" is not null
  )
  and exists (
    select 1
    from public.telegram_actions as action
    join public.telegrams as telegram on telegram.id = action."telegramId"
    where telegram."serialCode" = 'TEST-ROUTE-APPROVAL-9100002'
      and action.action = 'telegram.route.received'
  ),
  'receipt records both route state and an immutable action'
);

insert into public.telegrams (
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
select
  9100003,
  'TEST-ROUTE-NOT-REQUIRED-9100003',
  actor.id,
  actor.name,
  'Legacy direct route',
  'Test Station A',
  'Legacy direct route awaiting receiver confirmation',
  'normal',
  'normal',
  'administrative',
  'forwarded',
  unit_a.id,
  station_a.id
from public.users as actor
join public.organizations as unit_a on unit_a.code = 'TEST-ROUTE-UNIT-A'
join public.organizations as station_a on station_a.code = 'TEST-ROUTE-STATION-A'
where actor.name = 'Test Route Actor';

insert into public.telegram_routes (
  "telegramId",
  "fromOrganizationId",
  "toOrganizationId",
  "forwardedByUserId",
  status,
  "approvalStatus"
)
select
  telegram.id,
  unit_a.id,
  station_a.id,
  actor.id,
  'sent',
  'not_required'
from public.telegrams as telegram
join public.organizations as unit_a on unit_a.code = 'TEST-ROUTE-UNIT-A'
join public.organizations as station_a on station_a.code = 'TEST-ROUTE-STATION-A'
join public.users as actor on actor.name = 'Test Route Actor'
where telegram."serialCode" = 'TEST-ROUTE-NOT-REQUIRED-9100003';

select ok(
  exists (
    select 1
    from public.telegram_routes as route
    join public.telegrams as telegram on telegram.id = route."telegramId"
    where telegram."serialCode" = 'TEST-ROUTE-NOT-REQUIRED-9100003'
      and route."approvalStatus" = 'not_required'
      and route."receiverDecisionStatus" = 'pending'
      and route.status = 'sent'
  ),
  'legacy direct route awaits receiver decision without authority approval'
);

select lives_ok(
  $$
    select public.decide_telegram_route_receiver(
      route.id,
      receiver.id,
      true,
      null
    )
    from public.telegram_routes as route
    join public.telegrams as telegram on telegram.id = route."telegramId"
    join public.users as receiver on receiver.name = 'Test Route Station Actor'
    where telegram."serialCode" = 'TEST-ROUTE-NOT-REQUIRED-9100003'
  $$,
  'receiving organization can accept a not-required legacy route'
);

select ok(
  exists (
    select 1
    from public.telegram_routes as route
    join public.telegrams as telegram on telegram.id = route."telegramId"
    where telegram."serialCode" = 'TEST-ROUTE-NOT-REQUIRED-9100003'
      and route."receiverDecisionStatus" = 'accepted'
      and route.status = 'received'
      and route."receivedAt" is not null
  ),
  'receiver acceptance persists the route decision and receipt time'
);

select ok(
  exists (
    select 1
    from public.telegram_actions as action
    join public.telegrams as telegram on telegram.id = action."telegramId"
    where telegram."serialCode" = 'TEST-ROUTE-NOT-REQUIRED-9100003'
      and action.action = 'telegram.route.receiver_accept'
  ),
  'receiver acceptance persists its audit action'
);

select * from finish();
rollback;
