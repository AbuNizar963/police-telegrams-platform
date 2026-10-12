-- نقل عدة حسابات إلى جهة واحدة مع مزامنة users.organizationId
-- و organization_memberships بشكل ذري وآمن.
--
-- الاستخدام:
-- 1) عدّل target_organization_code إلى code الجهة المستهدفة.
-- 2) عدّل قائمة user_id في INSERT أدناه.
-- 3) شغّل السكربت أولًا مع ROLLBACK لمراجعة النتائج.
-- 4) إذا كانت النتائج صحيحة، غيّر ROLLBACK إلى COMMIT ثم شغّله مرة أخرى.
--
-- ملاحظات:
-- - لا يشمل مالك النظام isPlatformOwner=true حفاظًا على آلية اختيار جهة عمله.
-- - لا يغيّر organizationId للبرقيات القديمة؛ البرقيات تبقى تابعة للجهة التي أُنشئت فيها.
-- - الحسابات ستشاهد برقيات الجهة الجديدة بعد تسجيل الخروج والدخول أو تحديث الجلسة.

BEGIN;

CREATE TEMP TABLE _move_accounts (
  user_id integer PRIMARY KEY
) ON COMMIT DROP;

-- استبدل الأرقام بمعرّفات الحسابات المراد نقلها.
INSERT INTO _move_accounts (user_id)
VALUES
  (2),
  (3);

-- استبدل القيمة بكود الجهة من organizations.code.
CREATE TEMP TABLE _move_target (
  organization_id uuid PRIMARY KEY,
  organization_name text NOT NULL
) ON COMMIT DROP;

INSERT INTO _move_target (organization_id, organization_name)
SELECT id, name
FROM public.organizations
WHERE code = 'REPLACE-WITH-ORGANIZATION-CODE'
  AND "isActive" = true;

DO $$
DECLARE
  selected_count integer;
  existing_count integer;
  owner_count integer;
  target_count integer;
BEGIN
  SELECT count(*) INTO target_count FROM _move_target;
  IF target_count <> 1 THEN
    RAISE EXCEPTION
      'يجب أن يعيد كود الجهة جهة مفعّلة واحدة فقط. العدد الحالي: %',
      target_count;
  END IF;

  SELECT count(*) INTO selected_count FROM _move_accounts;
  IF selected_count = 0 THEN
    RAISE EXCEPTION 'لم يتم تحديد أي حساب للنقل';
  END IF;

  SELECT count(*) INTO existing_count
  FROM _move_accounts selected
  JOIN public.users account ON account.id = selected.user_id;
  IF existing_count <> selected_count THEN
    RAISE EXCEPTION
      'بعض user_id غير موجود. المحدد: %، الموجود: %',
      selected_count, existing_count;
  END IF;

  SELECT count(*) INTO owner_count
  FROM _move_accounts selected
  JOIN public.users account ON account.id = selected.user_id
  WHERE account."isPlatformOwner" = true;
  IF owner_count > 0 THEN
    RAISE EXCEPTION
      'لا يمكن نقل مالك النظام بهذا السكربت. استخدم اختيار جهة العمل من النظام.';
  END IF;
END $$;

-- معاينة قبل التعديل.
SELECT
  account.id AS user_id,
  account.username,
  account.name,
  account."organizationId" AS old_organization_id,
  old_org.name AS old_organization_name,
  target.organization_id AS new_organization_id,
  target.organization_name AS new_organization_name,
  membership."organizationId" AS current_membership_organization_id,
  membership.role AS current_membership_role,
  membership."isActive" AS current_membership_active
FROM _move_accounts selected
JOIN public.users account ON account.id = selected.user_id
CROSS JOIN _move_target target
LEFT JOIN public.organizations old_org
  ON old_org.id = account."organizationId"
LEFT JOIN LATERAL (
  SELECT m."organizationId", m.role, m."isActive"
  FROM public.organization_memberships m
  WHERE m."userId" = account.id
  ORDER BY m."isActive" DESC, m."createdAt" DESC
  LIMIT 1
) membership ON true
ORDER BY account.id;

-- 1) تحديث الجهة الأساسية للحسابات.
UPDATE public.users account
SET
  "organizationId" = target.organization_id,
  "updatedAt" = now()
FROM _move_accounts selected
CROSS JOIN _move_target target
WHERE account.id = selected.user_id;

-- 2) تعطيل أي عضويات نشطة قديمة للحسابات المنقولة.
UPDATE public.organization_memberships membership
SET
  "isActive" = false,
  "updatedAt" = now()
FROM _move_accounts selected
WHERE membership."userId" = selected.user_id
  AND membership."isActive" = true;

-- 3) إنشاء أو إعادة تفعيل عضوية الجهة المستهدفة.
--    يحافظ على role الموجود في الجهة المستهدفة إن وجد.
INSERT INTO public.organization_memberships (
  "organizationId",
  "userId",
  role,
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  target.organization_id,
  account.id,
  COALESCE(
    (
      SELECT existing.role
      FROM public.organization_memberships existing
      WHERE existing."organizationId" = target.organization_id
        AND existing."userId" = account.id
    ),
    CASE
      WHEN account.role = 'admin' THEN 'organization_admin'::public.organization_member_role
      ELSE 'dispatcher'::public.organization_member_role
    END
  ),
  true,
  now(),
  now()
FROM _move_accounts selected
JOIN public.users account ON account.id = selected.user_id
CROSS JOIN _move_target target
ON CONFLICT ("organizationId", "userId") DO UPDATE
SET
  "isActive" = true,
  "updatedAt" = now();

-- تحقق نهائي: يجب أن تكون organizationId والعضوية النشطة متطابقتين.
SELECT
  account.id AS user_id,
  account.username,
  account."organizationId" AS account_organization_id,
  membership."organizationId" AS active_membership_organization_id,
  organization.name AS organization_name,
  membership.role,
  membership."isActive"
FROM _move_accounts selected
JOIN public.users account ON account.id = selected.user_id
JOIN public.organization_memberships membership
  ON membership."userId" = account.id
 AND membership."organizationId" = account."organizationId"
 AND membership."isActive" = true
JOIN public.organizations organization
  ON organization.id = account."organizationId"
ORDER BY account.id;

-- للتجربة الأولى اترك ROLLBACK.
-- بعد التأكد من نتيجة المعاينة والتحقق النهائي، استبدله بـ COMMIT.
ROLLBACK;
