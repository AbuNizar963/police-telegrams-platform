begin;

select plan(5);

-- Use a range above all existing telegrams so this test is safe on both
-- clean CI databases and databases containing application data.
update public.department_settings
   set "serialStart" = coalesce(
         (select max("serialNumber") from public.telegrams),
         0
       ) + 100,
       "nextSerial" = coalesce(
         (select max("serialNumber") from public.telegrams),
         0
       ) + 100
 where "configKey" = 'primary';

select results_eq(
  $$ select public.allocate_serial_number() $$,
  $$ select coalesce(max("serialNumber"), 0) + 100 from public.telegrams $$,
  'first allocation starts at the configured value above existing telegrams'
);

select results_eq(
  $$ select public.allocate_serial_number() $$,
  $$ select "serialStart" + 1 from public.department_settings where "configKey" = 'primary' $$,
  'consecutive allocations advance the sequence'
);

-- Simulate a stale nextSerial value while preserving existing telegrams.
update public.department_settings
   set "serialStart" = 1,
       "nextSerial" = 1
 where "configKey" = 'primary';

select results_eq(
  $$ select public.allocate_serial_number() $$,
  $$ select coalesce(max("serialNumber"), 0) + 1 from public.telegrams $$,
  'allocator moves past the highest existing serial when settings drift backward'
);

select results_eq(
  $$ select "nextSerial" from public.department_settings where "configKey" = 'primary' $$,
  $$ select coalesce(max("serialNumber"), 0) + 2 from public.telegrams $$,
  'nextSerial is advanced beyond the highest existing serial'
);

update public.department_settings
   set "nextSerial" = 2147483647
 where "configKey" = 'primary';

select throws_ok(
  $$ select public.allocate_serial_number() $$,
  '22003',
  'Telegram serial number limit reached',
  'allocator rejects integer overflow instead of wrapping'
);

select * from finish();
rollback;
