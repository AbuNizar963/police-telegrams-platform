# police-telegrams-platform — ملاحظات العمل

## المشكلة الأصلية
مستودع واحد لنظام واحد بفرعين: `main` (الويب React/Vite + الخادم Express/tRPC/Supabase) و`flutter-mobile-app` (عميل Flutter في `mobile/`).

## قواعد العمل
- أي إصلاح أو ميزة تُطبَّق على الفرعين معًا بنفس الوظائف والمسميات وتجربة المستخدم.
- كل فرع بلغته: TypeScript/React على `main`، Dart/Flutter على `flutter-mobile-app`.
- يُختبر كل فرع ويُدفع وحده.
- طريقة الدفع (اختيار المستخدم): فرع عمل منفصل لكل بيئة (مثل `fix/<name>-web` و`fix/<name>-flutter`) ثم Pull Request إلى `main` و`flutter-mobile-app`.

## الحالة (يونيو 2026)
- تمت مراجعة بنية المستودع. لا توجد تعديلات على الشيفرة بعد.
- في انتظار طلب المستخدم الأول.
