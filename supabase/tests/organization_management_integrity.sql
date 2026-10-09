begin;

select plan(17);

select has_index(
  'public',
  'organizations',
  'organizations_single_central_root_idx',
  'database enforces a single central root'
);

select has_index(
  'public',
  'department_settings',
  'department_settings_organization_unique_idx',
  'each organization has one settings row'
);

select lives_ok(
  $$
    with parent as (
      insert into public.organizations (code, name, type, "parentOrganizationId")
      values ('TEST-ATOMIC-HIER-A', 'Atomic Hierarchy A', 'governorate', null)
      returning id
    )
    insert into public.organizations (code, name, type, "parentOrganizationId")
    select 'TEST-ATOMIC-HIER-B', 'Atomic Hierarchy B', 'department', parent.id
    from parent
  $$,
  'test organizations can be inserted'
);

select throws_ok(
  $$
    update public.organizations
    set "parentOrganizationId" = id
    where code = 'TEST-ATOMIC-HIER-A'
  $$,
  '23514',
  'An organization cannot be its own parent',
  'a self-parent relationship is rejected'
);

select throws_ok(
  $$
    update public.organizations as parent
    set "parentOrganizationId" = child.id
    from public.organizations as child
    where parent.code = 'TEST-ATOMIC-HIER-A'
      and child.code = 'TEST-ATOMIC-HIER-B'
  $$,
  '23514',
  'Organization parent change would create a hierarchy cycle',
  'a parent update that creates a cycle is rejected'
);

select lives_ok(
  $$
    select public.save_department_settings_atomic(
      null,
      organization.id,
      '{
        "departmentName":"Atomic Test Unit",
        "unitName":"Operations",
        "unitChiefRank":"Captain",
        "unitChiefName":"Test Chief",
        "serialPrefix":"OUT",
        "incomingSerialPrefix":"IN",
        "serialStart":10,
        "incomingSerialStart":30,
        "nextSerial":10,
        "nextOutgoingSerial":10,
        "nextIncomingSerial":30,
        "timezone":"Asia/Damascus",
        "dateFormat":"dd/MM/yyyy HH:mm:ss",
        "numberSystem":"latin",
        "logoUrl":null,
        "updatedByUserId":9000000
      }'::jsonb
    )
    from public.organizations as organization
    where organization.code = 'TEST-ATOMIC-HIER-B'
  $$,
  'atomic settings save creates one organization row'
);

select is(
  (
    select settings."nextOutgoingSerial"
    from public.department_settings as settings
    join public.organizations as organization
      on organization.id = settings."organizationId"
    where organization.code = 'TEST-ATOMIC-HIER-B'
  ),
  10,
  'new outgoing counter starts at the configured value'
);

select lives_ok(
  $$
    update public.department_settings
    set "nextOutgoingSerial" = 42,
        "nextIncomingSerial" = 73
    where "organizationId" = (
      select id from public.organizations where code = 'TEST-ATOMIC-HIER-B'
    )
  $$,
  'allocator counter state can advance'
);

select lives_ok(
  $$
    select public.save_department_settings_atomic(
      settings.id,
      organization.id,
      '{
        "departmentName":"Atomic Test Unit Updated",
        "unitName":"Operations",
        "unitChiefRank":"Captain",
        "unitChiefName":"Test Chief",
        "serialPrefix":"OUT",
        "incomingSerialPrefix":"IN",
        "serialStart":10,
        "incomingSerialStart":30,
        "nextSerial":10,
        "nextOutgoingSerial":10,
        "nextIncomingSerial":30,
        "timezone":"Asia/Damascus",
        "dateFormat":"dd/MM/yyyy HH:mm:ss",
        "numberSystem":"latin",
        "logoUrl":null,
        "updatedByUserId":9000000
      }'::jsonb
    )
    from public.organizations as organization
    join public.department_settings as settings
      on settings."organizationId" = organization.id
    where organization.code = 'TEST-ATOMIC-HIER-B'
  $$,
  'saving unrelated settings does not overwrite allocation counters'
);

select is(
  (
    select settings."nextOutgoingSerial"
    from public.department_settings as settings
    join public.organizations as organization
      on organization.id = settings."organizationId"
    where organization.code = 'TEST-ATOMIC-HIER-B'
  ),
  42,
  'outgoing allocator progress survives an unrelated settings save'
);

select is(
  (
    select settings."nextIncomingSerial"
    from public.department_settings as settings
    join public.organizations as organization
      on organization.id = settings."organizationId"
    where organization.code = 'TEST-ATOMIC-HIER-B'
  ),
  73,
  'incoming allocator progress survives an unrelated settings save'
);

select lives_ok(
  $$
    select public.save_department_settings_atomic(
      settings.id,
      organization.id,
      '{
        "departmentName":"Atomic Test Unit Updated",
        "unitName":"Operations",
        "unitChiefRank":"Captain",
        "unitChiefName":"Test Chief",
        "serialPrefix":"OUT-2",
        "incomingSerialPrefix":"IN",
        "serialStart":50,
        "incomingSerialStart":30,
        "nextSerial":50,
        "nextOutgoingSerial":50,
        "nextIncomingSerial":30,
        "timezone":"Asia/Damascus",
        "dateFormat":"dd/MM/yyyy HH:mm:ss",
        "numberSystem":"latin",
        "logoUrl":null,
        "updatedByUserId":9000000
      }'::jsonb
    )
    from public.organizations as organization
    join public.department_settings as settings
      on settings."organizationId" = organization.id
    where organization.code = 'TEST-ATOMIC-HIER-B'
  $$,
  'changing an outgoing prefix and start saves atomically'
);

select is(
  (
    select settings."nextOutgoingSerial"
    from public.department_settings as settings
    join public.organizations as organization
      on organization.id = settings."organizationId"
    where organization.code = 'TEST-ATOMIC-HIER-B'
  ),
  50,
  'outgoing counter resets only when its numbering configuration changes'
);

select is(
  (
    select settings."nextIncomingSerial"
    from public.department_settings as settings
    join public.organizations as organization
      on organization.id = settings."organizationId"
    where organization.code = 'TEST-ATOMIC-HIER-B'
  ),
  73,
  'changing outgoing numbering preserves the independent incoming counter'
);

select lives_ok(
  $$
    update public.department_settings
    set "nextIncomingSerial" = 90
    where "organizationId" = (
      select id from public.organizations where code = 'TEST-ATOMIC-HIER-B'
    )
  $$,
  'incoming allocator can advance independently'
);

select lives_ok(
  $$
    select public.save_department_settings_atomic(
      null,
      organization.id,
      '{
        "departmentName":"Atomic Test Unit Upsert",
        "unitName":"Operations",
        "unitChiefRank":"Captain",
        "unitChiefName":"Test Chief",
        "serialPrefix":"OUT-2",
        "incomingSerialPrefix":"IN",
        "serialStart":50,
        "incomingSerialStart":30,
        "nextSerial":50,
        "nextOutgoingSerial":50,
        "nextIncomingSerial":30,
        "timezone":"Asia/Damascus",
        "dateFormat":"dd/MM/yyyy HH:mm:ss",
        "numberSystem":"latin",
        "logoUrl":null,
        "updatedByUserId":9000000
      }'::jsonb
    )
    from public.organizations as organization
    where organization.code = 'TEST-ATOMIC-HIER-B'
  $$,
  'settings upsert safely targets the existing organization row'
);

select is(
  (
    select settings."nextIncomingSerial"
    from public.department_settings as settings
    join public.organizations as organization
      on organization.id = settings."organizationId"
    where organization.code = 'TEST-ATOMIC-HIER-B'
  ),
  90,
  'same-configuration upsert preserves a concurrent incoming allocation'
);

select * from finish();
rollback;
