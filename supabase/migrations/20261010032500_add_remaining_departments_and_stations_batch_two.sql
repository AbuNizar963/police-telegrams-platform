-- Batch two: remaining departments and stations.
-- The migration is idempotent. Stations are attached to an explicit police_department
-- parent so the hierarchy remains central -> governorate -> police_department -> station.

CREATE UNIQUE INDEX IF NOT EXISTS organizations_parent_name_unique_idx
  ON public.organizations ("parentOrganizationId", lower(btrim(name)));

-- Add the rural police-department parents needed by station records whose exact
-- local section parent is not documented in the reviewed sources.
WITH rural_parents (governorate_code, code, name) AS (
  VALUES
    ('GOV-RURAL_DAMASCUS', 'SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'مديرية الأمن الداخلي بالريف'),
    ('GOV-HOMS', 'SYRIA-HOMS-RURAL-POLICE', 'مديرية الأمن الداخلي بالريف'),
    ('GOV-HAMA', 'SYRIA-HAMA-RURAL-POLICE', 'مديرية الأمن الداخلي بالريف'),
    ('GOV-LATAKIA', 'SYRIA-LATAKIA-RURAL-POLICE', 'مديرية الأمن الداخلي بالريف'),
    ('GOV-TARTUS', 'SYRIA-TARTUS-RURAL-POLICE', 'مديرية الأمن الداخلي بالريف'),
    ('GOV-DARAA', 'SYRIA-DARAA-RURAL-POLICE', 'مديرية الأمن الداخلي بالريف'),
    ('GOV-SUWEIDA', 'SYRIA-SUWEIDA-RURAL-POLICE', 'مديرية الأمن الداخلي بالريف'),
    ('GOV-QUNEITRA', 'SYRIA-QUNEITRA-RURAL-POLICE', 'مديرية الأمن الداخلي بالريف'),
    ('GOV-IDLIB', 'SYRIA-IDLIB-RURAL-POLICE', 'مديرية الأمن الداخلي بالريف'),
    ('GOV-DEIR_EZZOR', 'SYRIA-DEIR-EZZOR-RURAL-POLICE', 'مديرية الأمن الداخلي بالريف'),
    ('GOV-RAQQA', 'SYRIA-RAQQA-RURAL-POLICE', 'مديرية الأمن الداخلي بالريف'),
    ('GOV-HASAKA', 'SYRIA-HASAKA-RURAL-POLICE', 'مديرية الأمن الداخلي بالريف')
)
INSERT INTO public.organizations (
  "parentOrganizationId", code, name, type, "isActive"
)
SELECT parent.id, candidate.code, candidate.name,
       'police_department'::public.organization_type, true
FROM rural_parents AS candidate
JOIN public.organizations AS parent
  ON parent.code = candidate.governorate_code
 AND parent.type = 'governorate'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organizations AS existing
  WHERE existing."parentOrganizationId" = parent.id
    AND lower(btrim(existing.name)) = lower(btrim(candidate.name))
)
ON CONFLICT (code) DO NOTHING;

-- Remaining named city police departments from the reviewed user list.
WITH departments (governorate_code, code, name) AS (
  VALUES
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-NEW-SHAM', 'قسم الشام الجديدة'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-OLD-SHAM', 'قسم الشام القديمة'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-MARJEH', 'قسم المرجة'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-MIDAN', 'قسم الميدان'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-QADAM', 'قسم القدم'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-QABOUN', 'قسم القابون'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-BARZEH', 'قسم برزة'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-RUKN-ALDIN', 'قسم ركن الدين'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-SHAGHOUR', 'قسم الشاغور'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-DOUAILAA', 'قسم الدويلعة'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-BAB-TOUMA', 'قسم باب توما'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-DAMMAR', 'قسم دمر'),
    ('GOV-DAMASCUS', 'SYRIA-DAMASCUS-DEP-KAFR-SOUSA', 'قسم كفرسوسة'),

    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-AZIZIYAH', 'قسم العزيزية'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-SYRIAC', 'قسم السريان'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-FURQAN', 'قسم الفرقان'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-SEVEN-SEAS', 'قسم السبع بحرات'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-BAB-ALFARAJ', 'قسم باب الفرج'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-ANSARI', 'قسم الأنصاري'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-SALAH-ALDIN', 'قسم صلاح الدين'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-HAYDARIYAH', 'قسم الحيدرية'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-BUSTAN-BASHA', 'قسم بستان الباشا'),
    ('GOV-ALEPPO', 'SYRIA-ALEPPO-DEP-MASAKEN-HANANO', 'قسم مساكن هنانو'),

    ('GOV-HOMS', 'SYRIA-HOMS-DEP-BAYADA', 'قسم البياضة'),
    ('GOV-HOMS', 'SYRIA-HOMS-DEP-ASHIRA', 'قسم عشيرة'),
    ('GOV-HOMS', 'SYRIA-HOMS-DEP-ARMEN', 'قسم الأرمن'),
    ('GOV-HOMS', 'SYRIA-HOMS-DEP-WAER', 'قسم الوعر'),
    ('GOV-HOMS', 'SYRIA-HOMS-DEP-INSHAAAT', 'قسم الإنشاءات'),
    ('GOV-HOMS', 'SYRIA-HOMS-DEP-BAB-ALDREIB', 'قسم باب الدريب'),
    ('GOV-HOMS', 'SYRIA-HOMS-DEP-KARAM-SHAMSI', 'قسم كرم الشمسي'),

    ('GOV-HAMA', 'SYRIA-HAMA-DEP-ARBEEN', 'قسم الأربعين'),
    ('GOV-HAMA', 'SYRIA-HAMA-DEP-BAYAD', 'قسم البياض'),
    ('GOV-HAMA', 'SYRIA-HAMA-DEP-QUSOUR', 'قسم القصور'),
    ('GOV-HAMA', 'SYRIA-HAMA-DEP-TAYYAR', 'قسم الطيار'),

    ('GOV-LATAKIA', 'SYRIA-LATAKIA-DEP-BEACH', 'قسم الشاطئ'),
    ('GOV-LATAKIA', 'SYRIA-LATAKIA-DEP-PROJECT10', 'قسم المشروع العاشر'),
    ('GOV-LATAKIA', 'SYRIA-LATAKIA-DEP-ASHRAFIYAH', 'قسم الأشرفية'),
    ('GOV-LATAKIA', 'SYRIA-LATAKIA-DEP-QUTLI', 'قسم القوتلي'),
    ('GOV-LATAKIA', 'SYRIA-LATAKIA-DEP-RAMILA', 'قسم الرميلة'),

    ('GOV-TARTUS', 'SYRIA-TARTUS-DEP-NORTH', 'قسم الشرطة الشمالي'),
    ('GOV-TARTUS', 'SYRIA-TARTUS-DEP-PORT', 'قسم الميناء'),

    ('GOV-DARAA', 'SYRIA-DARAA-DEP-BALAD', 'قسم درعا البلد'),

    ('GOV-SUWEIDA', 'SYRIA-SUWEIDA-DEP-EAST', 'القسم الشرقي'),
    ('GOV-SUWEIDA', 'SYRIA-SUWEIDA-DEP-WEST', 'القسم الغربي'),

    ('GOV-IDLIB', 'SYRIA-IDLIB-DEP-CITY', 'قسم مدينة إدلب'),

    ('GOV-DEIR_EZZOR', 'SYRIA-DEIR-EZZOR-DEP-JOURA', 'قسم الجورة'),
    ('GOV-DEIR_EZZOR', 'SYRIA-DEIR-EZZOR-DEP-WORKERS', 'قسم العمال'),
    ('GOV-DEIR_EZZOR', 'SYRIA-DEIR-EZZOR-DEP-HAMIDIYAH', 'قسم الحميدية'),
    ('GOV-DEIR_EZZOR', 'SYRIA-DEIR-EZZOR-DEP-EMPLOYEES', 'قسم الموظفين'),

    ('GOV-RAQQA', 'SYRIA-RAQQA-DEP-CITY', 'قسم مدينة الرقة'),

    ('GOV-HASAKA', 'SYRIA-HASAKA-DEP-NASIRA', 'قسم الناصرة'),
    ('GOV-HASAKA', 'SYRIA-HASAKA-DEP-GHUWAIRAN', 'قسم غويرين'),
    ('GOV-HASAKA', 'SYRIA-HASAKA-DEP-MASHIRFA', 'قسم المشيرفة'),
    ('GOV-HASAKA', 'SYRIA-HASAKA-DEP-QAMISHLI-WEST', 'قسم القامشلي الغربي'),
    ('GOV-HASAKA', 'SYRIA-HASAKA-DEP-QAMISHLI-EAST', 'قسم القامشلي الشرقي')
)
INSERT INTO public.organizations (
  "parentOrganizationId", code, name, type, "isActive"
)
SELECT parent.id, candidate.code, candidate.name,
       'department'::public.organization_type, true
FROM departments AS candidate
JOIN public.organizations AS parent
  ON parent.code = candidate.governorate_code
 AND parent.type = 'governorate'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organizations AS existing
  WHERE existing."parentOrganizationId" = parent.id
    AND lower(btrim(existing.name)) = lower(btrim(candidate.name))
)
ON CONFLICT (code) DO NOTHING;

-- Stations/makhafers. Their exact local section is not consistently named in
-- the available sources, so they are attached to the governorate's rural police
-- department rather than being incorrectly attached to an unrelated city section.
WITH stations (parent_code, code, name) AS (
  VALUES
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-JERMANA', 'مخفر جرمانا'),
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-TALL', 'مخفر التل'),
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-YABROUD', 'مخفر يبرود'),
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-NABK', 'مخفر النبك'),
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-QARA', 'مخفر قارة'),
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-QUTAYFA', 'مخفر القطيفة'),
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-RAHIBA', 'مخفر الرحيبة'),
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-JAYRUD', 'مخفر جيرود'),
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-ZABDANI', 'مخفر الزبداني'),
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-MADAYA', 'مخفر مضايا'),
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-DARAYA', 'مخفر داريا'),
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-MUDHAMIYA', 'مخفر المعضمية'),
    ('SYRIA-RURAL-DAMASCUS-RURAL-POLICE', 'SYRIA-RURAL-DAMASCUS-ST-KISWA', 'مخفر الكسوة'),

    ('SYRIA-HOMS-RURAL-POLICE', 'SYRIA-HOMS-ST-TAL-KALAKH', 'مخفر تلكلخ'),
    ('SYRIA-HOMS-RURAL-POLICE', 'SYRIA-HOMS-ST-QUSAYR', 'مخفر القصير'),
    ('SYRIA-HOMS-RURAL-POLICE', 'SYRIA-HOMS-ST-RASTAN', 'مخفر الرستن'),
    ('SYRIA-HOMS-RURAL-POLICE', 'SYRIA-HOMS-ST-PALMYRA', 'مخفر تدمر'),

    ('SYRIA-HAMA-RURAL-POLICE', 'SYRIA-HAMA-ST-MASYAF', 'مخفر مصياف'),
    ('SYRIA-HAMA-RURAL-POLICE', 'SYRIA-HAMA-ST-SALAMIYAH', 'مخفر سلمية'),
    ('SYRIA-HAMA-RURAL-POLICE', 'SYRIA-HAMA-ST-MUHARDAH', 'مخفر محردة'),
    ('SYRIA-HAMA-RURAL-POLICE', 'SYRIA-HAMA-ST-SAQILBIYAH', 'مخفر السقيلبية'),

    ('SYRIA-LATAKIA-RURAL-POLICE', 'SYRIA-LATAKIA-ST-JABLEH', 'مخفر جبلة'),
    ('SYRIA-LATAKIA-RURAL-POLICE', 'SYRIA-LATAKIA-ST-QARDAHA', 'مخفر القرداحة'),
    ('SYRIA-LATAKIA-RURAL-POLICE', 'SYRIA-LATAKIA-ST-HAFFA', 'مخفر الحفة'),

    ('SYRIA-TARTUS-RURAL-POLICE', 'SYRIA-TARTUS-ST-BANIYAS', 'مخفر بانياس'),
    ('SYRIA-TARTUS-RURAL-POLICE', 'SYRIA-TARTUS-ST-SAFITA', 'مخفر صافيتا'),
    ('SYRIA-TARTUS-RURAL-POLICE', 'SYRIA-TARTUS-ST-SHEIKH-BADR', 'مخفر الشيخ بدر'),
    ('SYRIA-TARTUS-RURAL-POLICE', 'SYRIA-TARTUS-ST-DRAYKISH', 'مخفر الدريكيش'),

    ('SYRIA-DARAA-RURAL-POLICE', 'SYRIA-DARAA-ST-IZRA', 'مخفر إزرع'),
    ('SYRIA-DARAA-RURAL-POLICE', 'SYRIA-DARAA-ST-SANAMAYN', 'مخفر الصنمين'),
    ('SYRIA-DARAA-RURAL-POLICE', 'SYRIA-DARAA-ST-BOSRA', 'مخفر بصرى الشام'),
    ('SYRIA-DARAA-RURAL-POLICE', 'SYRIA-DARAA-ST-JASIM', 'مخفر جاسم'),

    ('SYRIA-SUWEIDA-RURAL-POLICE', 'SYRIA-SUWEIDA-ST-SHAHBA', 'مخفر شهبا'),
    ('SYRIA-SUWEIDA-RURAL-POLICE', 'SYRIA-SUWEIDA-ST-SALKHAD', 'مخفر صلخد'),

    ('SYRIA-QUNEITRA-RURAL-POLICE', 'SYRIA-QUNEITRA-ST-QUNEITRA', 'مخفر قنيطرة'),
    ('SYRIA-QUNEITRA-RURAL-POLICE', 'SYRIA-QUNEITRA-ST-KHAN-ARNABA', 'مخفر خان أرنبة'),
    ('SYRIA-QUNEITRA-RURAL-POLICE', 'SYRIA-QUNEITRA-ST-FIQ', 'مخفر فيق'),

    ('SYRIA-IDLIB-RURAL-POLICE', 'SYRIA-IDLIB-ST-ARIHA', 'مخفر أريحا'),
    ('SYRIA-IDLIB-RURAL-POLICE', 'SYRIA-IDLIB-ST-JISR-ALSHUGHUR', 'مخفر جسر الشغور'),
    ('SYRIA-IDLIB-RURAL-POLICE', 'SYRIA-IDLIB-ST-MAARRAT-ALNUMAN', 'مخفر معرة النعمان'),
    ('SYRIA-IDLIB-RURAL-POLICE', 'SYRIA-IDLIB-ST-HAREM', 'مخفر حارم'),

    ('SYRIA-DEIR-EZZOR-RURAL-POLICE', 'SYRIA-DEIR-EZZOR-ST-BOUKAMAL', 'مخفر البوكمال'),
    ('SYRIA-DEIR-EZZOR-RURAL-POLICE', 'SYRIA-DEIR-EZZOR-ST-MAYADIN', 'مخفر الميادين'),

    ('SYRIA-RAQQA-RURAL-POLICE', 'SYRIA-RAQQA-ST-TAL-ABYAD', 'مخفر تل الأبيض'),
    ('SYRIA-RAQQA-RURAL-POLICE', 'SYRIA-RAQQA-ST-TABQA', 'مخفر الثورة (الطبقة)'),

    ('SYRIA-HASAKA-RURAL-POLICE', 'SYRIA-HASAKA-ST-MALIKIYAH', 'مخفر المالكية'),
    ('SYRIA-HASAKA-RURAL-POLICE', 'SYRIA-HASAKA-ST-RAAS-ALAIN', 'مخفر رأس العين'),
    ('SYRIA-HASAKA-RURAL-POLICE', 'SYRIA-HASAKA-ST-SHADDADI', 'مخفر الشدادي')
)
INSERT INTO public.organizations (
  "parentOrganizationId", code, name, type, "isActive"
)
SELECT parent.id, candidate.code, candidate.name,
       'station'::public.organization_type, true
FROM stations AS candidate
JOIN public.organizations AS parent
  ON parent.code = candidate.parent_code
 AND parent.type = 'police_department'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.organizations AS existing
  WHERE existing."parentOrganizationId" = parent.id
    AND lower(btrim(existing.name)) = lower(btrim(candidate.name))
)
ON CONFLICT (code) DO NOTHING;
