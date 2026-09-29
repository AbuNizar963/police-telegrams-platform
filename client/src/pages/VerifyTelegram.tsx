import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, CircleHelp, LoaderCircle, ShieldCheck, XCircle } from "lucide-react";

type VerificationResult = {
  valid: boolean;
  status?: "valid" | "archived";
  serialCode?: string;
  createdAt?: string;
  issuer?: string;
  error?: string;
};

export default function VerifyTelegram() {
  const [, params] = useRoute<{ token: string }>("/verify/:token");
  const token = params?.token;
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      if (!token) {
        setResult({ valid: false });
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/verify/${encodeURIComponent(token)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const payload = (await response.json()) as VerificationResult;
        if (!cancelled) setResult(payload);
      } catch {
        if (!cancelled) setResult({ valid: false, error: "تعذر الاتصال بخدمة التحقق. يرجى المحاولة لاحقًا." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void verify();
    return () => { cancelled = true; };
  }, [token]);

  const verified = result?.valid === true;

  return (
    <main dir="rtl" lang="ar" className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-8">
      <section className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <header className="flex items-center gap-3 bg-[#10233f] px-6 py-5 text-white">
          <ShieldCheck className="h-8 w-8 text-[#d8c38e]" aria-hidden="true" />
          <div>
            <p className="text-sm text-slate-300">منظومة البرقيات الرسمية</p>
            <h1 className="text-xl font-bold">التحقق من صحة البرقية</h1>
          </div>
        </header>
        <div className="space-y-5 px-6 py-8 text-center">
          {loading ? (
            <>
              <LoaderCircle className="mx-auto h-12 w-12 animate-spin text-slate-500" aria-hidden="true" />
              <p className="font-semibold text-slate-700">جارٍ التحقق من الوثيقة...</p>
            </>
          ) : verified ? (
            <>
              {result.status === "archived" ? (
                <CircleHelp className="mx-auto h-14 w-14 text-amber-600" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" aria-hidden="true" />
              )}
              <h2 className="text-xl font-bold text-slate-900">
                {result.status === "archived" ? "الوثيقة صحيحة لكنها مؤرشفة" : "تم التحقق من صحة البرقية"}
              </h2>
              <p className="text-sm leading-7 text-slate-600">
                الرمز مرتبط بسجل موجود في منظومة البرقيات. هذه الصفحة تؤكد صحة المرجع فقط ولا تعرض محتوى البرقية أو بياناتها السرية.
              </p>
              <dl className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-right">
                <div><dt className="text-xs text-slate-500">رقم البرقية</dt><dd className="mt-1 font-semibold text-slate-900" dir="ltr">{result.serialCode}</dd></div>
                <div><dt className="text-xs text-slate-500">تاريخ الإصدار</dt><dd className="mt-1 font-semibold text-slate-900">{result.createdAt ? new Intl.DateTimeFormat("ar", { dateStyle: "long", timeStyle: "short" }).format(new Date(result.createdAt)) : "—"}</dd></div>
                <div><dt className="text-xs text-slate-500">الجهة المصدرة</dt><dd className="mt-1 font-semibold text-slate-900">{result.issuer}</dd></div>
              </dl>
              <p className="text-xs text-slate-500">للاطلاع على التفاصيل، يرجى الرجوع إلى الجهة المخولة.</p>
            </>
          ) : (
            <>
              <XCircle className="mx-auto h-14 w-14 text-red-600" aria-hidden="true" />
              <h2 className="text-xl font-bold text-slate-900">تعذر إثبات صحة البرقية</h2>
              <p className="text-sm leading-7 text-slate-600">
                {result?.error ?? "الرابط غير صالح أو أن الوثيقة غير موجودة في المنظومة. يرجى مراجعة الجهة المصدرة."}
              </p>
            </>
          )}
        </div>
        <footer className="border-t border-slate-200 px-6 py-4 text-center text-xs text-slate-500">
          خدمة تحقق رسمية — لا تشارك رابط التحقق مع غير المخولين.
        </footer>
      </section>
    </main>
  );
}
