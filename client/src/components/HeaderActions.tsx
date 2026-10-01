import { Bell, Moon, Settings, Sun, UserRound, Users } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";

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
          <DropdownMenuItem onSelect={() => { window.location.href = "/profile"; }} className="cursor-pointer justify-end gap-2">
            <UserRound className="h-4 w-4" />
            <span>الملف الشخصي</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={toggleTheme}
            className="cursor-pointer justify-end gap-2"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>{theme === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}</span>
          </DropdownMenuItem>
          {user?.role === "admin" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-right text-xs font-bold text-[#9b7c3d]">
                إعدادات المالك
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => window.dispatchEvent(new CustomEvent("open-owner-user-management"))}
                className="cursor-pointer justify-end gap-2"
              >
                <Users className="h-4 w-4" />
                <span>إدارة حسابات الشرطيين وإضافتها</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => window.dispatchEvent(new CustomEvent("open-department-settings"))}
                className="cursor-pointer justify-end gap-2"
              >
                <Settings className="h-4 w-4" />
                <span>إعدادات القسم والموقع</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
