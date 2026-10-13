# إعداد إشعارات Firebase لتطبيق برقيات الشرطة

تمت إضافة طبقة Firebase Cloud Messaging إلى التطبيق. قبل تشغيل Push Notifications على أجهزة حقيقية يجب ربط المشروع بمشروع Firebase الفعلي:

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

## iOS

1. أنشئ تطبيق iOS داخل Firebase بالمعرّف الموجود في Xcode داخل `PRODUCT_BUNDLE_IDENTIFIER`.
2. نزّل `GoogleService-Info.plist` وأضفه إلى:

```text
mobile/ios/Runner/GoogleService-Info.plist
```

3. أضف APNs Authentication Key أو APNs Certificate في إعدادات Firebase.
4. فعّل `Push Notifications` و`Background Modes > Remote notifications` في Xcode.

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

تم ربط الخادم بإرسال Firebase Admin عند إنشاء البرقية الواردة. أضف هذه المتغيرات السرية إلى بيئة الخادم أو Vercel، ولا تضعها داخل تطبيق الهاتف:

```text
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@....iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

ثم طبّق ترحيل قاعدة البيانات:

```text
supabase/migrations/20261013200000_add_mobile_fcm_tokens.sql
```

بعد تسجيل الدخول، يسجل تطبيق Flutter الـFCM token عبر `notifications.registerMobileToken`. وعند وصول برقية إلى الجهة المستلمة يرسل الخادم الإشعار لكل أجهزة الجهة، ويحذف الرموز المنتهية تلقائيًا.
