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

## ملاحظة الخادم

التطبيق أصبح جاهزًا لاستقبال FCM token ومعالجة الإشعار في الواجهة والخلفية وعند الضغط عليه. يلزم إضافة Firebase Admin SDK في الخادم وتسجيل FCM tokens للمستخدمين حتى يبدأ الخادم بإرسال الإشعارات الفعلية للبرقيات الواردة. لا تضع مفاتيح Firebase الخاصة أو Service Account داخل تطبيق الهاتف.
