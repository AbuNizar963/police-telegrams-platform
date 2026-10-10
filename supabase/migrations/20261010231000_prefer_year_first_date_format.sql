-- Prefer the unambiguous ISO-like date order in new and existing organization settings.
-- Only replace the previous application default; preserve deliberate custom formats.
alter table public.department_settings
  alter column "dateFormat" set default 'yyyy/MM/dd HH:mm:ss';

update public.department_settings
set "dateFormat" = 'yyyy/MM/dd HH:mm:ss'
where "dateFormat" = 'dd/MM/yyyy HH:mm:ss';
