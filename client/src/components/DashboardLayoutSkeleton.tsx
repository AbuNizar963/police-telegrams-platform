import { Loader2 } from "lucide-react";
import { BrandMark } from "./BrandMark";

export function DashboardLayoutSkeleton() {
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground"
      dir="rtl"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <BrandMark size="lg" />
        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight">
            نظام برقيات الشرطة
          </h1>
          <p className="text-sm text-muted-foreground">
            جارٍ التحقق من جلسة الدخول وتجهيز لوحة التحكم…
          </p>
        </div>
        <div
          className="flex items-center gap-2 text-sm font-semibold text-primary"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>لحظات من فضلك</span>
        </div>
      </div>
    </main>
  );
}
