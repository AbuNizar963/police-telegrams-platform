UPDATE public.organizations
SET name = replace(name, 'قيادة شرطة محافظة', 'قيادة الأمن الداخلي في محافظة'),
    "updatedAt" = now()
WHERE type = 'governorate'
  AND name LIKE 'قيادة شرطة محافظة%';

UPDATE public.department_settings AS settings
SET "departmentName" = replace(settings."departmentName", 'قيادة شرطة محافظة', 'قيادة الأمن الداخلي في محافظة'),
    "unitName" = replace(settings."unitName", 'قيادة شرطة محافظة', 'قيادة الأمن الداخلي في محافظة'),
    "updatedAt" = now()
FROM public.organizations AS organization
WHERE settings."organizationId" = organization.id
  AND organization.type = 'governorate'
  AND (
    settings."departmentName" LIKE 'قيادة شرطة محافظة%'
    OR settings."unitName" LIKE 'قيادة شرطة محافظة%'
  );
