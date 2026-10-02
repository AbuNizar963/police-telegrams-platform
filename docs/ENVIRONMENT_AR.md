# جرد متغيرات البيئة

| المتغير | التصنيف | الاستخدام |
|---|---|---|
| `SUPABASE_URL` | سري تشغيلي | اتصال الخادم بمشروع Supabase |
| `SUPABASE_SECRET_KEY` | سري للغاية | عمليات الخادم فقط؛ ممنوع في العميل |
| `SUPABASE_STORAGE_BUCKET` | إعداد خادمي | اسم bucket الخاص |
| `VITE_SUPABASE_URL` | عام للعميل | عنوان المشروع إذا احتاجته الواجهة |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | عام مقيد بـ RLS | مفتاح الواجهة فقط |
| `AUTH_SESSION_SECRET` | سري للغاية | توقيع جلسات التطبيق، 32 حرفًا على الأقل |
| `OWNER_USERNAME` | إعداد خادمي | اسم حساب المالك الأولي |
| `OWNER_INITIAL_PASSWORD` أو `OWNER_PASSWORD_HASH` | سري للغاية | تهيئة حساب المالك مرة أولى |
| `ADMIN_EMAILS` | إعداد خادمي | قائمة حسابات الإدارة عند الحاجة |
| `VITE_GOOGLE_MAPS_API_KEY` | عام مقيد بالنطاق | الخرائط، إن فُعلت |
| `OWNER_NOTIFICATION_WEBHOOK_URL` | سري | تنبيهات المالك، إن فُعلت |

لا تُضاف أسرار فعلية إلى `.env.example` أو المستودع أو سجلات التدقيق أو حزم المتصفح.
