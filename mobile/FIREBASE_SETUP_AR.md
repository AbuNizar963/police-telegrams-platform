# إعداد إشعارات Firebase لتطبيق برقيات الشرطة

أُضيف دعم Firebase Cloud Messaging في التطبيق، مع قناة عامة للبرقيات وقناة عالية الأهمية للعاجلة والطارئة ونغمة مخصّصة. **الكود وحده لا يفعّل الإرسال**: يلزم إعداد Firebase للعميل والخادم، ونشر تغييرات الخادم، ثم اختبار الإشعار على جهاز فعلي.

## Android

1. أنشئ تطبيق Android داخل Firebase بالمعرّف:

```text
com.hadir.police.police_telegrams
```

2. نزّل `google-services.json` وضعه في:

```text
mobile/android/app/google-services.json
```

3. فعّل Cloud Messaging من Firebase Console.

في GitHub Actions، لا ترفع ملف JSON إلى المستودع. خزّنه كسرّ باسم `FIREBASE_ANDROID_CONFIG_BASE64` (الناتج من `base64 -w0 google-services.json`) ليحقنه سير العمل مؤقتًا أثناء البناء ويتحقق من معرّف الحزمة. إذا غاب السر، ينجح فحص البناء لكن يتوقف نشر Release عمدًا.

## iOS

1. أنشئ تطبيق iOS داخل Firebase بالمعرّف الموجود في Xcode داخل `PRODUCT_BUNDLE_IDENTIFIER`.
2. نزّل `GoogleService-Info.plist` وأضفه إلى:

```text
mobile/ios/Runner/GoogleService-Info.plist
```

3. أضف APNs Authentication Key أو APNs Certificate في إعدادات Firebase.
4. فعّل `Push Notifications` و`Background Modes > Remote notifications` في Xcode.

## أنواع الإشعارات وسلوكها

- تُرسل التنبيهات للبرقيات الواردة والصادرة التي تمر عبر مسارات الإنشاء والإحالة.
- البرقية العادية تستخدم قناة «برقيات جديدة»؛ الأولوية العاجلة أو الفئة «طوارئ» تستخدم قناة «برقيات عاجلة وطارئة» مع أهمية واهتزاز أعلى.
- النغمة الأصلية محفوظة بصيغ Android وiOS داخل موارد التطبيق. يمكن للمستخدم تعديل صوت/سلوك القناة من إعدادات Android، كما يمكنه إيقاف الإشعارات من إعدادات الجهاز أو التطبيق.
- في Android تُعرض إشعارات المقدمة محليًا على القناة نفسها؛ والضغط عليها يفتح البرقية. كما يعيد التطبيق تسجيل FCM token عند تجديده.
- لا يمكن إثبات عمل FCM حتى تكتمل إعدادات Firebase ويُختبر جهاز فعلي بإذن الإشعارات.

## Payload البرقية الواردة

يجب أن يحتوي إشعار البرقية الواردة على البيانات التالية حتى يفتح التطبيق التفاصيل مباشرة:

```json
{
  "notification": {
    "title": "برقية واردة جديدة",
    "body": "وصلت برقية جديدة إلى جهتك"
  },
  "data": {
    "type": "telegram.incoming",
    "telegramId": "123"
  }
}
```

## إعداد الخادم

بعد دمج ونشر تغييرات الخادم، أضف هذه المتغيرات السرية إلى بيئة الخادم أو Vercel، ولا تضعها داخل تطبيق الهاتف:

```text
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@....iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

ثم طبّق ترحيل قاعدة البيانات إن لم يكن مطبقًا:

```text
supabase/migrations/20261013200000_add_mobile_fcm_tokens.sql
```

بعد تسجيل الدخول ومنح إذن الإشعارات، يسجل تطبيق Flutter الـFCM token عبر `notifications.registerMobileToken`. وعند وصول البرقية إلى الجهة يرسل الخادم الإشعار إلى أجهزة أعضائها، ويحذف الرموز المنتهية تلقائيًا.

قبل السماح بنشر APK على Releases، يتطلب GitHub Actions أيضًا السر `PUSH_NOTIFICATIONS_SERVER_READY` وقيمته `true`. لا تضفه إلا بعد إعداد متغيرات Firebase Admin أعلاه ونشر تغييرات الخادم؛ فهذه علامة جاهزية يدوية تمنع نشر تطبيق يوحي بأن الإشعارات تعمل بينما الإعداد ناقص.
