# نطاق Secret Scanning بين الفروع

## الخلاصة

لا يتيح Secret Scanning المدمج في GitHub استثناء فرع واحد مع إبقاء الحماية مفعّلة لبقية المستودع. يذكر توثيق GitHub أنه يفحص سجل Git كاملًا على جميع فروع المستودع؛ لذلك لا يوقف تعديل مرشحات GitHub Actions المسح الأصلي [1].

في هذا المستودع نستخدم كذلك Gitleaks ضمن GitHub Actions، وهذا فحص مستقل يمكن تحديد الفروع التي تشغّله من ملف workflow. إعداد `main` يراقب `main`، وإعداد فرع Flutter يراقب `flutter-mobile-app`. بعد تحديث الفرع إلى الاسم المعتمد، لا يبقى فرع تطبيقي ثانٍ باسم قديم.

## مكان إعداد GitHub

من صفحة المستودع افتح **Settings**، ثم **Security and quality** في الشريط الجانبي، ثم **Advanced Security** وراجع إعداد **Secret Protection**. يوضح دليل GitHub الرسمي تفعيل الميزة وإدارتها من إعدادات المستودع [2]. هذه الإعدادات تخص تفعيل الميزة أو إعداد الحماية، ولا توفر مرشحًا لتجاهل فرع منفرد.

لتغيير نطاق Gitleaks الخاص بالمستودع، عدّل `on.push.branches` و`on.pull_request.branches` في `.github/workflows/secret-scan.yml`. احتفظ بمرشح `main` في نسخة `main`، وبمرشح `flutter-mobile-app` في نسخة الفرع نفسه. تعديل هذه القوائم يغيّر تشغيل Gitleaks فقط، وليس نطاق Secret Scanning الأصلي.

إذا أظهر أي فحص اعتمادًا حقيقيًا، ألغِه أو دوّره فورًا لدى الجهة المصدرة؛ حذف السطر وحده لا يبطل السر، وقد يظل موجودًا في تاريخ Git [1]. لا تُعطّل Secret Scanning بالكامل لتجاوز تنبيه فرعي.

## سبب بقاء ملف Flutter workflow في main

يشترط GitHub وجود ملف workflow الذي يستخدم `workflow_dispatch` في الفرع الافتراضي كي يقبل التشغيل اليدوي؛ ويمكن عندها اختيار فرع التشغيل [3]. لذلك يبقى تعريف `.github/workflows/flutter-mobile.yml` في `main`، بينما تُقيّد محفزات البناء والنشر إلى `flutter-mobile-app`. هذا لا ينقل شيفرة تطبيق Flutter إلى `main`.

## المراجع

[1]: https://docs.github.com/code-security/secret-scanning/about-secret-scanning "GitHub Secret Scanning overview"
[2]: https://docs.github.com/en/code-security/how-tos/secure-your-secrets/detect-secret-leaks/enable-secret-scanning "GitHub: Enable secret scanning"
[3]: https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch "GitHub Actions workflow_dispatch"
