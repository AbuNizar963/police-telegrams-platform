import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  DEFAULT_PLATFORM_DOCUMENT_SETTINGS,
  MAX_WATERMARK_OPACITY_PERCENT,
} from "../../../shared/platformDocumentSettings";

export default function PlatformDocumentSettings() {
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const organizationContext = trpc.organizations.context.useQuery(undefined, {
    enabled: Boolean(me.data),
  });
  const isOwner =
    me.data?.isPlatformOwner === true ||
    organizationContext.data?.isOwner === true;
  const [open, setOpen] = useState(false);
  const [showMinistryWatermarkText, setShowMinistryWatermarkText] =
    useState<boolean>(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.showMinistryWatermarkText
    );
  const [watermarkOpacityPercent, setWatermarkOpacityPercent] =
    useState<number>(
      DEFAULT_PLATFORM_DOCUMENT_SETTINGS.watermarkOpacityPercent
    );
  const [headerDividerColor, setHeaderDividerColor] = useState<string>(
    DEFAULT_PLATFORM_DOCUMENT_SETTINGS.headerDividerColor
  );
  const [showVerificationQr, setShowVerificationQr] = useState<boolean>(
    DEFAULT_PLATFORM_DOCUMENT_SETTINGS.showVerificationQr
  );
  const utils = trpc.useUtils();
  const settings = trpc.platformDocumentSettings.get.useQuery(undefined, {
    enabled: open && isOwner,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const update = trpc.platformDocumentSettings.update.useMutation({
    onSuccess: async saved => {
      setShowMinistryWatermarkText(saved.showMinistryWatermarkText);
      setWatermarkOpacityPercent(saved.watermarkOpacityPercent);
      setHeaderDividerColor(saved.headerDividerColor);
      setShowVerificationQr(saved.showVerificationQr);
      await utils.platformDocumentSettings.get.invalidate();
      toast.success("تم حفظ إعدادات وثائق النظام");
      setOpen(false);
    },
    onError: error => toast.error(error.message || "تعذر حفظ إعدادات النظام"),
  });

  useEffect(() => {
    const handler = () => {
      if (isOwner) setOpen(true);
    };
    window.addEventListener("open-platform-document-settings", handler);
    return () =>
      window.removeEventListener("open-platform-document-settings", handler);
  }, [isOwner]);

  useEffect(() => {
    if (!open || !settings.data) return;
    setShowMinistryWatermarkText(settings.data.showMinistryWatermarkText);
    setWatermarkOpacityPercent(settings.data.watermarkOpacityPercent);
    setHeaderDividerColor(settings.data.headerDividerColor);
    setShowVerificationQr(settings.data.showVerificationQr);
  }, [open, settings.data]);

  if (!open || !isOwner) return null;

  return (
    <div className="telegram-print-modal fixed inset-0 z-[90] overflow-y-auto bg-black/55 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="platform-document-settings-title"
        dir="rtl"
        className="mx-auto my-4 w-full max-w-2xl rounded-2xl border bg-background p-4 shadow-2xl sm:my-10 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              إعدادات المالك
            </p>
            <h2
              id="platform-document-settings-title"
              className="mt-1 text-xl font-black"
            >
              إعدادات وثائق النظام
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              تُطبّق هذه الخيارات على وثائق جميع الجهات الجديدة.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="إغلاق إعدادات النظام"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {settings.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            جارٍ تحميل الإعدادات…
          </p>
        ) : settings.error ? (
          <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p>تعذر تحميل إعدادات النظام.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => void settings.refetch()}
            >
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="flex items-start gap-3 rounded-xl border p-4">
              <input
                type="checkbox"
                checked={showMinistryWatermarkText}
                onChange={event =>
                  setShowMinistryWatermarkText(event.target.checked)
                }
                className="mt-1 h-4 w-4 accent-[#10233f]"
              />
              <span>
                <span className="block text-sm font-bold">
                  إظهار عبارة «وزارة الداخلية» كعلامة مائية
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  يتحكم هذا الخيار بالعبارات المتكررة خلف محتوى الوثيقة، ولا
                  يغيّر الترويسة الرسمية.
                </span>
              </span>
            </label>

            <label className="block rounded-xl border p-4">
              <span className="flex items-center justify-between gap-3 text-sm font-bold">
                <span>شفافية العلامة المائية</span>
                <span className="tabular-nums">{watermarkOpacityPercent}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={MAX_WATERMARK_OPACITY_PERCENT}
                step={1}
                value={watermarkOpacityPercent}
                onChange={event =>
                  setWatermarkOpacityPercent(Number(event.target.value))
                }
                aria-label="نسبة شفافية العلامة المائية"
                className="mt-3 w-full accent-[#10233f]"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                تطبّق النسبة نفسها على عبارة الوزارة وشعار الجهة؛ الحد الأعلى
                {` ${MAX_WATERMARK_OPACITY_PERCENT}% `}لضمان بقاء نص البرقية
                واضحًا.
              </span>
            </label>

            <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <span>
                <span className="block text-sm font-bold">
                  لون الخط الفاصل في ترويسة البرقية
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  اختر لونًا متناسقًا مع الهوية البصرية للوثائق.
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <code dir="ltr" className="text-xs font-semibold">
                  {headerDividerColor.toUpperCase()}
                </code>
                <input
                  type="color"
                  value={headerDividerColor}
                  onChange={event => setHeaderDividerColor(event.target.value)}
                  aria-label="اختيار لون الخط الفاصل"
                  className="h-10 w-12 cursor-pointer rounded-md border bg-background p-1"
                />
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border p-4">
              <input
                type="checkbox"
                checked={showVerificationQr}
                onChange={event => setShowVerificationQr(event.target.checked)}
                className="mt-1 h-4 w-4 accent-[#10233f]"
              />
              <span>
                <span className="block text-sm font-bold">
                  إظهار QR للتحقق في وثائق جميع الجهات
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  إخفاء الرمز المطبوع لا يعطّل رابط التحقق أو صلاحية التحقق من
                  البرقية.
                </span>
              </span>
            </label>

            <p className="rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
              تسري التغييرات على الوثائق التي تُنشأ بعد الحفظ. النسخ التي سبق
              تنزيلها لا تتغير.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                disabled={!settings.data || update.isPending}
                onClick={() =>
                  update.mutate({
                    showMinistryWatermarkText,
                    watermarkOpacityPercent,
                    headerDividerColor,
                    showVerificationQr,
                  })
                }
                className="bg-[#10233f] text-white hover:bg-[#18375f]"
              >
                {update.isPending ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
