# إشعارات إصدارات تطبيق الهاتف

أضيف مسار لإشعار أجهزة الهاتف تلقائيًا بعد نشر إصدار Android جديد على GitHub Releases.

## آلية العمل

1. ينشر سير عمل `flutter-mobile.yml` إصدار APK جديدًا.
2. بعد نجاح نشر الإصدار، يستدعي GitHub Actions المسار:

   ```text
   POST /api/internal/mobile-release
   ```

3. يتحقق الخادم من السر الداخلي، ثم يرسل إشعار Firebase Cloud Messaging إلى رموز الأجهزة المسجلة.
4. يحتوي الإشعار على النوع `app.update`، وعند الضغط عليه تُفتح صفحة **حول التطبيق والتحديثات**.
5. لا يبدأ تنزيل APK أو تثبيته تلقائيًا؛ موافقة المستخدم مطلوبة.

## إعدادات التشغيل المطلوبة

أضف القيمة نفسها في بيئة الخادم الإنتاجية وفي أسرار GitHub Actions:

- في Vercel أو بيئة الخادم:
  - `RELEASE_NOTIFICATION_SECRET`
- في GitHub Actions Secret للمستودع:
  - `RELEASE_NOTIFICATION_SECRET`

يجب أن تكون القيمة طويلة وعشوائية، ولا تُحفظ في ملفات المستودع أو داخل التطبيق.

قبل إرسال إشعارات الإصدار، يجب أيضًا إعداد Firebase Admin على الخادم ثم ضبط GitHub Actions repository secret باسم `PUSH_NOTIFICATIONS_SERVER_READY` وقيمته `true`. هذا مؤشر جاهزية يدوي؛ إذا لم يكن جاهزًا، يتخطى workflow خطوة الإشعار. راجع [دليل إعداد Firebase للهاتف](../mobile/FIREBASE_SETUP_AR.md) للتفاصيل، ولا تضبط المؤشر قبل نشر إعدادات الخادم.

اختياريًا يمكن تغيير عنوان الخادم عبر GitHub Actions Variable باسم:

- `RELEASE_NOTIFICATION_URL`

وعند عدم وجوده يستخدم سير العمل:

```text
https://police-telegrams-platform.vercel.app
```

إذا لم يُضبط السر، يستمر نشر الإصدار كالمعتاد مع تحذير، لكن لا تُرسل إشعارات للأجهزة.
