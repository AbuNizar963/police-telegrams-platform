-- Add only confirmed local police departments from the reviewed Google Maps/user list.
-- This migration is idempotent and prevents duplicate names under the same governorate.

CREATE UNIQUE INDEX IF NOT EXISTS organizations_parent_name_unique_idx
  ON public.organizations ("parentOrganizationId", lower(btrim(name)));

WITH candidates (parent_code, code, name) AS (
  VALUES
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-SALIHIYA', 'قسم الصالحية'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-QANAWAT', 'قسم القنوات'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-HAMIDIYAH', 'قسم الحميدية'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-MAZZEH', 'قسم المزة'),

    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-HAMDANIYAH', 'قسم شرطة الحمدانية'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-NABREB', 'قسم شرطة النبرب'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-HANANO', 'قسم شرطة هنانو'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-SHAAR', 'قسم شرطة الشعار'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-SUKKARI', 'قسم شرطة السكري'),

    ('GOV-HOMS', 'SYRIA-HOMS-DEP-NEW-HOMS', 'قسم شرطة حمص الجديدة'),
    ('GOV-HOMS', 'SYRIA-HOMS-DEP-SHAMMAS', 'قسم شرطة الشماس'),
    ('GOV-HOMS', 'SYRIA-HOMS-DEP-OUTER', 'قسم الشرطة الخارجي'),

    ('GOV-HAMA', 'SYRIA-HAMA-DEP-DABBAGHA', 'قسم شرطة دباغة'),
    ('GOV-HAMA', 'SYRIA-HAMA-DEP-STATION', 'قسم المحطة'),
    ('GOV-HAMA', 'SYRIA-HAMA-DEP-HADER', 'قسم شرطة الحاضر'),
    ('GOV-HAMA', 'SYRIA-HAMA-DEP-HAMIDIYAH', 'قسم الحميدية'),

    ('GOV-LATAKIA', 'SYRIA-LATAKIA-DEP-SULAIBA', 'قسم شرطة الصليبة'),
    ('GOV-LATAKIA', 'SYRIA-LATAKIA-DEP-NORTH', 'قسم الشرطة الشمالي'),
    ('GOV-LATAKIA', 'SYRIA-LATAKIA-DEP-BLUE-BEACH', 'قسم شرطة الشاطئ الأزرق'),

    ('GOV-TARTUS', 'SYRIA-TARTUS-DEP-EAST', 'قسم الشرطة الشرقي'),
    ('GOV-TARTUS', 'SYRIA-TARTUS-DEP-WEST', 'قسم طرطوس الغربي'),

    ('GOV-DARAA', 'SYRIA-DARAA-DEP-STATION', 'قسم شرطة المحطة'),

    ('GOV-DEIR_EZZOR', 'SYRIA-DEIR-EZZOR-DEP-NATIONAL-HOSPITAL', 'قسم شرطة مشفى الوطني'),
    ('GOV-DEIR_EZZOR', 'SYRIA-DEIR-EZZOR-DEP-REVOLUTION', 'قسم شرطة حي الثورة'),
    ('GOV-DEIR_EZZOR', 'SYRIA-DEIR-EZZOR-DEP-EAST', 'قسم الشرطة الشرقي'),

    ('GOV-HASAKA', 'SYRIA-HASAKA-DEP-NORTHERN-CITY', 'قسم شرطة المدينة الشمالي')
)
INSERT INTO public.organizations (
  "parentOrganizationId", code, name, type, "isActive"
)
SELECT parent.id, candidate.code, candidate.name, 'department'::public.organization_type, true
FROM candidates AS candidate
JOIN public.organizations AS parent
  ON parent.code = candidate.parent_code
 AND parent.type = 'governorate'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organizations AS existing
  WHERE existing."parentOrganizationId" = parent.id
    AND lower(btrim(existing.name)) = lower(btrim(candidate.name))
)
ON CONFLICT (code) DO NOTHING;
