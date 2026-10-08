UPDATE public.department_settings AS settings
SET "departmentName" = organizations.name,
    "unitName" = organizations.name,
    "unitChiefRank" = '',
    "unitChiefName" = 'رئيس الجهة',
    "updatedAt" = now()
FROM public.organizations AS organizations
WHERE settings."organizationId" = organizations.id
  AND settings."departmentName" = 'قسم شرطة الشهباء';
