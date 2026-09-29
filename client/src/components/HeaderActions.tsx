import { useTheme } from "@/contexts/ThemeContext";
import { Bell, Moon, Settings, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type HeaderActionsProps = {
  onToggleSidebar: () => void;
};

export default function HeaderActions({
  onToggleSidebar,
}: HeaderActionsProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 rounded-full"
            aria-label="الإشعارات"
            title="الإشعارات"
          >
            <Bell className="h-[18px] w-[18px]" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">الإشعارات</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              التنبيهات الجديدة ستظهر هنا.
            </p>
          </div>
          <div className="flex min-h-28 items-center justify-center px-4 text-sm text-muted-foreground">
            لا توجد إشعارات جديدة
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-full"
        onClick={toggleTheme}
        disabled={!toggleTheme}
        aria-label={isDark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}
        title={isDark ? "الوضع النهاري" : "الوضع الليلي"}
      >
        {isDark ? (
          <Sun className="h-[18px] w-[18px]" />
        ) : (
          <Moon className="h-[18px] w-[18px]" />
        )}
      </Button>

      <Sheet>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            aria-label="الإعدادات"
            title="الإعدادات"
          >
            <Settings className="h-[18px] w-[18px]" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[min(92vw,380px)]">
          <SheetHeader className="border-b px-5 py-5">
            <SheetTitle>إعدادات الواجهة</SheetTitle>
            <SheetDescription>
              تحكم سريع في مظهر لوحة القيادة والتنقل.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 px-5">
            <button
              type="button"
              onClick={toggleTheme}
              disabled={!toggleTheme}
              className="flex w-full items-center justify-between rounded-xl border bg-card p-4 text-right transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div>
                <p className="font-medium">
                  {isDark ? "الوضع النهاري" : "الوضع الليلي"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isDark
                    ? "العودة إلى المظهر الفاتح"
                    : "استخدام المظهر الداكن للواجهة"}
                </p>
              </div>
              {isDark ? (
                <Sun className="h-5 w-5 shrink-0" />
              ) : (
                <Moon className="h-5 w-5 shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={onToggleSidebar}
              className="flex w-full items-center justify-between rounded-xl border bg-card p-4 text-right transition-colors hover:bg-accent"
            >
              <div>
                <p className="font-medium">الشريط الجانبي</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  إظهار أو طي قائمة التنقل الرئيسية
                </p>
              </div>
              <Settings className="h-5 w-5 shrink-0" />
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
