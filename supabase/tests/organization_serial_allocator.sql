begin;

select plan(5);

create temporary table organization_serial_test_context (
  organization_id uuid not null,
  user_id integer
) on commit drop;

with organization_row as (
  insert into public.organizations (code, name, type)
  values ('PGTAP-SERIAL-RECLAIM', 'جهة اختبار استعادة الترقيم', 'department')
  returning id
), settings_row as (
  insert into public.department_settings (
    "configKey",
    "organizationId",
    "serialStart",
    "nextSerial",
    "nextOutgoingSerial",
    "nextIncomingSerial"
  )
  select 'pgtap-serial-reclaim', id, 47000, 47000, 1, 1
  from organization_row
  returning "organizationId"
)
insert into organization_serial_test_context (organization_id)
select "organizationId" from settings_row;

WITH test_user AS (
  INSERT INTO public.users (
    "authUserId",
    name,
    "loginMethod",
    "organizationId"
  )
  SELECT
    gen_random_uuid(),
    'PGTAP Serial Allocator',
    'organization-serial-test',
    organization_id
  FROM organization_serial_test_context
  RETURNING id, "organizationId"
)
UPDATE organization_serial_test_context AS context
SET user_id = test_user.id
FROM test_user
WHERE context.organization_id = test_user."organizationId";

select results_eq(
  $$
    select public.allocate_organization_serial(
      (select organization_id from organization_serial_test_context),
      'outgoing'
    )
  $$,
  $$ values (47000::integer) $$,
  'outgoing allocator starts from the organization serialStart setting'
);

insert into public.telegrams (
  "serialNumber",
  "serialCode",
  "verificationToken",
  "createdByUserId",
  "organizationId",
  "currentOrganizationId",
  "organizationSerialNumber",
  "organizationSerialCode",
  "creatorName",
  subject,
  recipient,
  body,
  classification,
  priority,
  category,
  status
)
select
  coalesce((select max("serialNumber") from public.telegrams), 0) + 100000,
  'PGTAP-SERIAL-47000',
  gen_random_uuid(),
  (select user_id from organization_serial_test_context),
  organization_id,
  organization_id,
  47000,
  'PGTAP-47000',
  'اختبار pgTAP',
  'برقية اختبار رقم البداية',
  'جهة الاختبار',
  'محتوى اختبار الترقيم',
  'normal',
  'normal',
  'administrative',
  'draft'
from organization_serial_test_context;

select results_eq(
  $$
    select public.allocate_organization_serial(
      (select organization_id from organization_serial_test_context),
      'outgoing'
    )
  $$,
  $$ values (47001::integer) $$,
  'outgoing allocator advances past an active telegram number'
);

insert into public.telegrams (
  "serialNumber",
  "serialCode",
  "verificationToken",
  "createdByUserId",
  "organizationId",
  "currentOrganizationId",
  "organizationSerialNumber",
  "organizationSerialCode",
  "creatorName",
  subject,
  recipient,
  body,
  classification,
  priority,
  category,
  status
)
select
  coalesce((select max("serialNumber") from public.telegrams), 0) + 100000,
  'PGTAP-SERIAL-47001',
  gen_random_uuid(),
  (select user_id from organization_serial_test_context),
  organization_id,
  organization_id,
  47001,
  'PGTAP-47001',
  'اختبار pgTAP',
  'برقية اختبار متتابعة',
  'جهة الاختبار',
  'محتوى اختبار الترقيم',
  'normal',
  'normal',
  'administrative',
  'draft'
from organization_serial_test_context;

delete from public.telegrams
where "organizationId" = (select organization_id from organization_serial_test_context)
  and "organizationSerialNumber" = 47000;

select results_eq(
  $$
    select "nextOutgoingSerial"
    from public.department_settings
    where "organizationId" = (select organization_id from organization_serial_test_context)
  $$,
  $$ values (47000::integer) $$,
  'deleting a telegram reopens its outgoing number'
);

select results_eq(
  $$
    select public.allocate_organization_serial(
      (select organization_id from organization_serial_test_context),
      'outgoing'
    )
  $$,
  $$ values (47000::integer) $$,
  'the next telegram reuses the deleted outgoing number'
);

select results_eq(
  $$
    select public.allocate_organization_serial(
      (select organization_id from organization_serial_test_context),
      'outgoing'
    )
  $$,
  $$ values (47002::integer) $$,
  'allocator skips retained numbers after reusing the deleted one'
);

select * from finish();
rollback;
