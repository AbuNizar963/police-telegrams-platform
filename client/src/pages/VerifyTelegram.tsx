import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { CheckCircle2, CircleHelp, LoaderCircle, XCircle } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { getTelegramDisplayNumber } from "@/lib/telegramDisplay";

type VerificationResult = {
  valid: boolean;
  status?: "valid" | "archived";
  displaySerialCode?: string;
  serialNumber?: number;
  createdAt?: string;
  unitName?: string;
  error?: string;
};

function formatTelegramDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SY", {
    timeZone: "Asia/Damascus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

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
        const response = await fetch(
          `/api/verify/${encodeURIComponent(token)}`,
          {
            headers: { Accept: "application/json" },
            cache: "no-store",
          }
        );
        const payload = (await response.json()) as VerificationResult;
        if (!cancelled) setResult(payload);
      } catch {
        if (!cancelled) {
          setResult({
            valid: false,
            error: "تعذر الاتصال بخدمة التحقق. يرجى المحاولة لاحقًا.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const verified = result?.valid === true;

  return (
    <main
      dir="rtl"
      lang="ar"
      className="flex min-h-dvh items-center justify-center bg-background px-4 py-8"
    >
      <section className="surface-elevated w-full max-w-lg overflow-hidden rounded-[1.5rem] border bg-card shadow-xl">
        <header className="flex items-center gap-3 bg-primary px-6 py-5 text-primary-foreground">
          <BrandMark size="sm" imageClassName="brightness-110" />
          <div>
            <p className="text-sm text-primary-foreground/75">
              منظومة البرقيات الرسمية
            </p>
            <h1 className="text-xl font-bold">التحقق من صحة البرقية</h1>
          </div>
        </header>

        <div className="space-y-5 px-6 py-8 text-center">
          {loading ? (
            <>
              <LoaderCircle
                className="mx-auto h-12 w-12 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
              <p className="font-semibold text-foreground">
                جارٍ التحقق من الوثيقة...
              </p>
            </>
          ) : verified ? (
            <>
              {result.status === "archived" ? (
                <CircleHelp
                  className="mx-auto h-14 w-14 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle2
                  className="mx-auto h-14 w-14 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              )}

              <h2 className="text-xl font-bold text-foreground">
                {result.status === "archived"
                  ? "الوثيقة صحيحة لكنها مؤرشفة"
                  : "تم التحقق من صحة الوثيقة"}
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                الرمز مرتبط بسجل موجود في منظومة البرقيات. هذه الصفحة تؤكد صحة
                المرجع فقط ولا تعرض محتوى البرقية أو بياناتها السرية.
              </p>

              <dl className="space-y-3 rounded-xl border border-border bg-muted/40 p-4 text-right">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    اسم الوحدة الشرطية
                  </dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    {result.unitName || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">رقم البرقية</dt>
                  <dd className="mt-1 font-semibold text-foreground" dir="ltr">
                    {getTelegramDisplayNumber(
                      result.displaySerialCode ||
                        String(result.serialNumber ?? "")
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    تاريخ البرقية
                  </dt>
                  <dd className="mt-1 font-semibold text-foreground">
                    {formatTelegramDate(result.createdAt)}
                  </dd>
                </div>
              </dl>

              <p className="text-xs text-muted-foreground">
                للاطلاع على التفاصيل، يرجى الرجوع إلى الجهة المخولة.
              </p>
            </>
          ) : (
            <>
              <XCircle
                className="mx-auto h-14 w-14 text-red-600 dark:text-red-400"
                aria-hidden="true"
              />
              <h2 className="text-xl font-bold text-foreground">
                تعذر إثبات صحة البرقية
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                {result?.error ??
                  "الرابط غير صالح أو أن الوثيقة غير موجودة في المنظومة. يرجى مراجعة الجهة المصدرة."}
              </p>
            </>
          )}
        </div>

        <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
          خدمة تحقق رسمية — لا تشارك رابط التحقق مع غير المخولين.
        </footer>
      </section>
    </main>
  );
}
