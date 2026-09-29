import { Bell, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";

function ActionButton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      title={label}
      className="h-10 w-10 rounded-xl border-border/70 bg-background/95 shadow-sm backdrop-blur hover:bg-accent"
    >
      {children}
    </Button>
  );
}

/**
 * Compact, accessible quick actions displayed in the dashboard's upper corner.
 * Notification and account menus intentionally show only information currently
 * available in the app; they do not imply a backend notification system exists.
 */
export default function HeaderActions() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();

  return (
    <div
      dir="rtl"
      className="fixed left-4 top-3 z-[60] flex items-center gap-2 sm:left-6 sm:top-4"
      aria-label="إجراءات الصفحة"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="الإشعارات"
            title="الإشعارات"
            className="relative h-10 w-10 rounded-xl border-border/70 bg-background/95 shadow-sm backdrop-blur hover:bg-accent"
          >
            <Bell className="h-[18px] w-[18px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-72">
          <DropdownMenuLabel className="text-right">الإشعارات</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-3 py-6 text-center">
            <Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">لا توجد إشعارات جديدة</p>
            <p className="mt-1 text-xs text-muted-foreground">
              ستظهر هنا التنبيهات عند تفعيل نظام الإشعارات.
            </p>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={theme === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}
        title={theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
        onClick={toggleTheme}
        disabled={!toggleTheme}
        className="h-10 w-10 rounded-xl border-border/70 bg-background/95 shadow-sm backdrop-blur hover:bg-accent"
      >
        {theme === "dark" ? (
          <Sun className="h-[18px] w-[18px]" />
        ) : (
          <Moon className="h-[18px] w-[18px]" />
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="الإعدادات"
            title="الإعدادات"
            className="h-10 w-10 rounded-xl border-border/70 bg-background/95 shadow-sm backdrop-blur hover:bg-accent"
          >
            <Settings className="h-[18px] w-[18px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64">
          <DropdownMenuLabel className="text-right">الحساب الحالي</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="space-y-1 px-3 py-2 text-right">
            <p className="text-sm font-medium">{user?.name || "مستخدم النظام"}</p>
            <p dir="ltr" className="break-all text-xs text-muted-foreground">
              {user?.email || "—"}
            </p>
          </div>
          <DropdownMenuSeparator />
          <p className="px-3 py-2 text-right text-xs text-muted-foreground">
            إعدادات الحساب التفصيلية غير متاحة حاليًا.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
