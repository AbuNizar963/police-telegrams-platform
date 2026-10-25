BEGIN;

SELECT plan(20);

INSERT INTO public.organizations (id, code, name, type)
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'TEST-COMPLETED-ARCHIVE-20261025',
  'جهة اختبار أرشفة البرقيات',
  'department'
);

INSERT INTO public.users ("authUserId", "organizationId", name, role)
VALUES (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'مستخدم اختبار معزول',
  'user'
);

INSERT INTO public.organization_memberships (
  "organizationId", "userId", role, "isActive"
)
SELECT
  'a1000000-0000-4000-8000-000000000001',
  id,
  'dispatcher',
  true
FROM public.users
WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001';

INSERT INTO public.telegrams (
  "serialNumber", "serialCode", "verificationToken", "createdByUserId",
  "organizationId", "currentOrganizationId", "creatorName", subject,
  recipient, body, status
)
VALUES
  (
    2099000001, 'TEST-COMPLETED-ARCHIVE-OK',
    'a3000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.users WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001'),
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'مستخدم اختبار معزول', 'برقية مكتملة للاختبار', 'جهة اختبار',
    'بيانات اصطناعية لا تخص أي مستخدم حقيقي', 'completed'
  ),
  (
    2099000002, 'TEST-COMPLETED-ARCHIVE-INVALID',
    'a3000000-0000-4000-8000-000000000002',
    (SELECT id FROM public.users WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001'),
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'مستخدم اختبار معزول', 'انتقال غير مسموح', 'جهة اختبار',
    'بيانات اصطناعية لا تخص أي مستخدم حقيقي', 'completed'
  ),
  (
    2099000003, 'TEST-COMPLETED-ARCHIVE-STALE',
    'a3000000-0000-4000-8000-000000000003',
    (SELECT id FROM public.users WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001'),
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'مستخدم اختبار معزول', 'مراجعة revision', 'جهة اختبار',
    'بيانات اصطناعية لا تخص أي مستخدم حقيقي', 'completed'
  ),
  (
    2099000004, 'TEST-RESOLVED-ARCHIVE-REGRESSION',
    'a3000000-0000-4000-8000-000000000004',
    (SELECT id FROM public.users WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001'),
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'مستخدم اختبار معزول', 'أرشفة resolved', 'جهة اختبار',
    'بيانات اصطناعية لا تخص أي مستخدم حقيقي', 'resolved'
  ),
  (
    2099000005, 'TEST-PENDING-ARCHIVE-REGRESSION',
    'a3000000-0000-4000-8000-000000000005',
    (SELECT id FROM public.users WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001'),
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'مستخدم اختبار معزول', 'أرشفة pending', 'جهة اختبار',
    'بيانات اصطناعية لا تخص أي مستخدم حقيقي', 'pending'
  ),
  (
    2099000006, 'TEST-IN-PROGRESS-ARCHIVE-REGRESSION',
    'a3000000-0000-4000-8000-000000000006',
    (SELECT id FROM public.users WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001'),
    'a1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'مستخدم اختبار معزول', 'أرشفة in_progress', 'جهة اختبار',
    'بيانات اصطناعية لا تخص أي مستخدم حقيقي', 'in_progress'
  );

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.transition_telegram(integer,integer,public.telegram_status,text,text,integer)',
    'EXECUTE'
  ),
  'صلاحية service_role لتنفيذ انتقال البرقية باقية'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.transition_telegram(integer,integer,public.telegram_status,text,text,integer)',
    'EXECUTE'
  ),
  'الدور anon لا يكتسب صلاحية تنفيذ الانتقال'
);

SELECT lives_ok(
  $$
    SELECT public.transition_telegram(
      (SELECT id FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-OK'),
      (SELECT id FROM public.users WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001'),
      'archived', NULL, 'archive-regression-test', 1
    )
  $$,
  'يسمح بأرشفة البرقية المكتملة'
);
SELECT is(
  (SELECT status::text FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-OK'),
  'archived',
  'تتحول الحالة إلى archived'
);
SELECT ok(
  (SELECT "archivedAt" IS NOT NULL FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-OK'),
  'يُسجل وقت الأرشفة'
);
SELECT ok(
  (SELECT "closedAt" IS NOT NULL FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-OK'),
  'يبقى وقت الإغلاق مضبوطًا عند الأرشفة'
);
SELECT is(
  (SELECT "revision" FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-OK'),
  2,
  'تزداد revision مرة واحدة فقط'
);
SELECT is(
  (SELECT count(*)::integer FROM public.telegram_actions WHERE "telegramId" = (SELECT id FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-OK')),
  1,
  'يسجل انتقال الأرشفة مرة واحدة'
);
SELECT is(
  (SELECT "fromStatus"::text FROM public.telegram_actions WHERE "telegramId" = (SELECT id FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-OK')),
  'completed',
  'يسجل الحالة المصدر الصحيحة'
);
SELECT is(
  (SELECT "toStatus"::text FROM public.telegram_actions WHERE "telegramId" = (SELECT id FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-OK')),
  'archived',
  'يسجل الحالة الهدف الصحيحة'
);
SELECT is(
  (SELECT metadata FROM public.telegram_actions WHERE "telegramId" = (SELECT id FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-OK')),
  'archive-regression-test',
  'يحافظ على metadata المرسلة'
);

SELECT throws_ok(
  $$
    SELECT public.transition_telegram(
      (SELECT id FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-INVALID'),
      (SELECT id FROM public.users WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001'),
      'in_progress', NULL, NULL, 1
    )
  $$,
  '22023',
  'Transition from completed to in_progress is not allowed',
  'يبقى الانتقال غير المسموح مرفوضًا'
);
SELECT is(
  (SELECT status::text FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-INVALID'),
  'completed',
  'لا تتغير الحالة بعد رفض انتقال غير مسموح'
);
SELECT is(
  (SELECT count(*)::integer FROM public.telegram_actions WHERE "telegramId" = (SELECT id FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-INVALID')),
  0,
  'لا يسجل إجراء عند رفض انتقال غير مسموح'
);
SELECT throws_ok(
  $$
    SELECT public.transition_telegram(
      (SELECT id FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-OK'),
      999999999,
      'archived', NULL, NULL, NULL
    )
  $$,
  '42501',
  'User is not authorized for this telegram organization',
  'يبقى التحقق من عضوية الجهة إلزاميًا'
);
SELECT throws_ok(
  $$
    SELECT public.transition_telegram(
      (SELECT id FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-STALE'),
      (SELECT id FROM public.users WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001'),
      'archived', NULL, NULL, 99
    )
  $$,
  '40001',
  'Telegram conflict: expected revision 99, current revision 1',
  'تبقى حماية تعارض revision فعالة'
);
SELECT is(
  (SELECT status::text FROM public.telegrams WHERE "serialCode" = 'TEST-COMPLETED-ARCHIVE-STALE'),
  'completed',
  'لا تتغير الحالة عند رفض revision قديم'
);

SELECT lives_ok(
  $$
    SELECT public.transition_telegram(
      (SELECT id FROM public.telegrams WHERE "serialCode" = 'TEST-RESOLVED-ARCHIVE-REGRESSION'),
      (SELECT id FROM public.users WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001'),
      'archived', NULL, NULL, 1
    )
  $$,
  'يبقى أرشيف الحالة resolved مسموحًا'
);
SELECT lives_ok(
  $$
    SELECT public.transition_telegram(
      (SELECT id FROM public.telegrams WHERE "serialCode" = 'TEST-PENDING-ARCHIVE-REGRESSION'),
      (SELECT id FROM public.users WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001'),
      'archived', NULL, NULL, 1
    )
  $$,
  'تبقى قاعدة أرشفة pending الحالية دون تغيير'
);
SELECT lives_ok(
  $$
    SELECT public.transition_telegram(
      (SELECT id FROM public.telegrams WHERE "serialCode" = 'TEST-IN-PROGRESS-ARCHIVE-REGRESSION'),
      (SELECT id FROM public.users WHERE "authUserId" = 'a2000000-0000-4000-8000-000000000001'),
      'archived', NULL, NULL, 1
    )
  $$,
  'تبقى قاعدة أرشفة in_progress الحالية دون تغيير'
);

SELECT * FROM finish();
ROLLBACK;
