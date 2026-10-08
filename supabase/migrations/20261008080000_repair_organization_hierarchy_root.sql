-- Repair the organization tree after the central root and governorate
-- parent links were lost. This migration is intentionally idempotent.

insert into public.organizations (
  code,
  name,
  type,
  "parentOrganizationId",
  "isActive"
)
values (
  'LEGACY-PRIMARY',
  'القيادة المركزية للأمن الداخلي',
  'central',
  null,
  true
)
on conflict (code) do nothing;

update public.organizations
set
  name = 'القيادة المركزية للأمن الداخلي',
  type = 'central',
  "parentOrganizationId" = null,
  "isActive" = true,
  "updatedAt" = now()
where code = 'LEGACY-PRIMARY';

-- Every governorate is a direct child of the central authority.
update public.organizations
set
  "parentOrganizationId" = (
    select id from public.organizations where code = 'LEGACY-PRIMARY'
  ),
  "updatedAt" = now()
where type = 'governorate'
  and code <> 'LEGACY-PRIMARY';

-- Preserve the existing Shahbaa department under Aleppo governorate.
update public.organizations
set
  "parentOrganizationId" = (
    select id from public.organizations where code = 'GOV-ALEPPO'
  ),
  "updatedAt" = now()
where code = 'ALSHAHBAA';
