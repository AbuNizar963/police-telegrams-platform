# خطة نقل النظام من Supabase إلى Appwrite

## الحالة

هذه المرحلة تضيف طبقة اتصال خادمية أولية مع Appwrite ولا تحول التطبيق تلقائياً بعد. تبقى طبقة Supabase الحالية فعالة إلى أن تكتمل إعادة كتابة المستودعات واختبارات التكافؤ؛ لا تحذف مفاتيح Supabase أو بياناته في هذه المرحلة.

## موارد Appwrite التي جرى التحقق منها

- المشروع: `Wathaeqi`، المعرّف `wathaeqi`.
- قاعدة البيانات: `wathaeqi-db`.
- مخزن الملفات: `document-attachments`، خاص ومفعّل، وحد الملف 10 MiB.
- الجداول الحالية تشمل: `users`, `organizations`, `organization_memberships`, `department_settings`, `telegrams`, `telegram_versions`, `telegram_attachments`, `telegram_actions`, `telegram_routes`, `notifications`, `push_subscriptions`, `mobile_push_tokens`, `audit_logs`, `platform_document_settings`.
- توجد أيضاً جداول `documents`, `templates`, `contacts`, `attachments`, `app_records` الخاصة بتجربة الوثائقي. يجب عدم حذفها.

## متغيرات الخادم

تُضبط على خدمة الخادم فقط، ولا توضع في متغيرات Vite أو تطبيق Flutter:

- `APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1`
- `APPWRITE_PROJECT_ID=wathaeqi`
- `APPWRITE_API_KEY=<server-only-secret>`
- `APPWRITE_DATABASE_ID=wathaeqi-db`
- `APPWRITE_STORAGE_BUCKET_ID=document-attachments`

لا تضع `APPWRITE_API_KEY` في GitHub أو ملفات المشروع أو الواجهة الأمامية. أضفه لاحقاً إلى متغيرات بيئة خدمة الخادم بعد التأكد من صلاحيات المفتاح.

## خطة التحويل الإلزامية

1. نقل طبقة الوصول إلى البيانات من Supabase إلى جداول Appwrite مع الحفاظ على أسماء الحقول والعلاقات والتحقق من صلاحيات الجهة.
2. نقل تسجيل الدخول والتحقق من كلمات المرور والجلسات إلى آلية موثوقة متوافقة مع Appwrite، وعدم تخزين كلمات المرور الصريحة أو كشف مفاتيح الخادم.
3. نقل تخزين المرفقات إلى Appwrite Storage. يتطلب هذا استبدال تدفق روابط الرفع الموقعة الحالي بمسار رفع خادمي آمن، لأن واجهة Appwrite لا تطابق واجهة Supabase الحالية.
4. نقل العمليات الذرية، تخصيص الأرقام، الانتقالات، سجل التدقيق، وحدود المعدل إلى معاملات/وظائف خادمية مكافئة. لا يجوز استبدالها بعمليات متعددة غير ذرية.
5. ترحيل البيانات الفعلية والتحقق من الأعداد والعلاقات والملفات وبصمات المرفقات قبل أي تبديل إنتاجي.
6. تحديث الويب وFlutter وCI والوثائق، ثم تشغيل الاختبارات لكل فرع على حدة.
7. إزالة حزمة Supabase ومجلد migrations وملفات الإعداد فقط بعد نجاح التحقق وموافقة المستخدم على تبديل الإنتاج.

## حماية البيانات

لم تنفذ هذه المرحلة أي حذف أو تعديل في قاعدة Appwrite أو Supabase. لا تعتبر الجداول المتطابقة دليلاً على اكتمال ترحيل البيانات؛ يجب فحص كل جدول وعدد سجلاته ومقارنة النتائج قبل القطع النهائي.
