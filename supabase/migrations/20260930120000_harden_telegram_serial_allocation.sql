-- Keep telegram numbering monotonic even when settings drift behind existing rows.
-- The settings row lock serializes allocators; the unique constraint on serialNumber
-- remains the final database-level safeguard against duplicates.

create or replace function public.allocate_serial_number()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated bigint;
  configured_start bigint;
  configured_next bigint;
  existing_max bigint;
begin
  insert into public.department_settings ("configKey")
  values ('primary')
  on conflict ("configKey") do nothing;

  select "serialStart", "nextSerial"
    into configured_start, configured_next
    from public.department_settings
   where "configKey" = 'primary'
   for update;

  select coalesce(max("serialNumber")::bigint, 0)
    into existing_max
    from public.telegrams;

  allocated := greatest(
    coalesce(configured_start, 1),
    coalesce(configured_next, 1),
    existing_max + 1,
    1
  );

  if allocated >= 2147483647 then
    raise exception 'Telegram serial number limit reached'
      using errcode = '22003';
  end if;

  update public.department_settings
     set "nextSerial" = (allocated + 1)::integer,
         "updatedAt" = now()
   where "configKey" = 'primary';

  return allocated::integer;
end;
$$;

revoke all on function public.allocate_serial_number() from public, anon, authenticated;
grant execute on function public.allocate_serial_number() to service_role;
