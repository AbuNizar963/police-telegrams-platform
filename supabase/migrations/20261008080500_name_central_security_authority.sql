-- Keep the central root identity independent from any unit branding.
update public.organizations
set
  name = 'القيادة المركزية للأمن الداخلي',
  type = 'central',
  "parentOrganizationId" = null,
  "isActive" = true,
  "updatedAt" = now()
where code = 'LEGACY-PRIMARY';
