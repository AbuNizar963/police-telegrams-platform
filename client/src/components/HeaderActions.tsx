import {
  Bell,
  FileText,
  Info,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  UserRound,
  Users,
} from "lucide-react";
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
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useEffect, useState } from "react";

function decodeVapidKey(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

function formatNotificationDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function requiresNotificationAction(type: string): boolean {
  return type === "route.approved" || type === "route.requested";
}

/**
 * Compact, accessible quick actions displayed in the dashboard's upper corner.
 * Notification and account menus intentionally show only information currently
 * The notification control uses the browser Push API and the registered PWA
 * service worker; it never sends subscription secrets to the client UI.
 */
export default function HeaderActions() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const organizationContext = trpc.organizations.context.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const canManageOrganizationSettings =
    user?.role === "admin" ||
    ["system_admin", "organization_admin"].includes(
      organizationContext.data?.role ?? ""
    );
  const canManageUsers =
    user?.role === "admin" ||
    [
      "system_admin",
      "organization_admin",
      "regional_admin",
      "organization_supervisor",
    ].includes(organizationContext.data?.role ?? "");
  const notificationConfig = trpc.notifications.config.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const notificationInbox = trpc.notifications.inbox.useQuery(undefined, {
    enabled: Boolean(user),
    refetchInterval: 15_000,
  });
  const markNotificationRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => void notificationInbox.refetch(),
  });
  const subscribe = trpc.notifications.subscribe.useMutation({
    onSuccess: () => toast.success("تم تفعيل إشعارات البرقيات على هذا الجهاز"),
    onError: error => toast.error(error.message || "تعذر تفعيل الإشعارات"),
  });
  const unsubscribe = trpc.notifications.unsubscribe.useMutation({
    onSuccess: () => toast.success("تم إيقاف إشعارات هذا الجهاز"),
    onError: error => toast.error(error.message || "تعذر إيقاف الإشعارات"),
  });
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready.then(registration =>
      registration.pushManager.getSubscription().then(subscription => {
        if (!cancelled) setPushEnabled(Boolean(subscription));
      })
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const togglePushNotifications = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      toast.error("هذا المتصفح لا يدعم إشعارات PWA");
      return;
    }
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
    if (permission !== "granted") {
      toast.error("اسمح بالإشعارات من إعدادات المتصفح ثم أعد المحاولة");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const current = await registration.pushManager.getSubscription();
    if (current) {
      await unsubscribe.mutateAsync({ endpoint: current.endpoint });
      await current.unsubscribe();
      setPushEnabled(false);
      return;
    }
    const publicKey = notificationConfig.data?.publicKey;
    if (!publicKey) {
      toast.error("إشعارات الخلفية غير مهيأة على الخادم بعد");
      return;
    }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(publicKey).buffer as ArrayBuffer,
    });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
      toast.error("تعذر قراءة بيانات اشتراك الإشعارات");
      return;
    }
    await subscribe.mutateAsync({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      userAgent: navigator.userAgent,
    });
    setPushEnabled(true);
  };

  if (!user) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="flex items-center gap-2"
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
            {(notificationInbox.data?.unreadCount ?? 0) > 0 && (
              <span
                aria-label={`${notificationInbox.data?.unreadCount} إشعار غير منجز`}
                className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-background"
              >
                {notificationInbox.data?.unreadCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="[direction:rtl] w-[min(92vw,26rem)] max-w-[calc(100vw-1rem)] p-0"
        >
          <DropdownMenuLabel className="px-4 py-3 text-right text-sm font-bold">
            الإشعارات
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notificationInbox.isLoading ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              جارٍ تحميل التنبيهات...
            </p>
          ) : notificationInbox.data?.items.length ? (
            <div className="max-h-[min(70vh,24rem)] overflow-y-auto p-2">
              {notificationInbox.data.items.map(notification => (
                <DropdownMenuItem
                  key={notification.id}
                  className="mb-1 min-w-0 cursor-pointer flex-col items-stretch gap-2 rounded-xl border border-transparent p-3 text-right hover:border-border hover:bg-muted/60"
                  onSelect={() => {
                    if (
                      !notification.readAt &&
                      !requiresNotificationAction(notification.type)
                    ) {
                      markNotificationRead.mutate({ id: notification.id });
                    }
                    if (notification.telegramId) {
                      window.dispatchEvent(
                        new CustomEvent("open-telegram", {
                          detail: { telegramId: notification.telegramId },
                        })
                      );
                    }
                  }}
                >
                  <span className="flex min-w-0 items-start justify-between gap-3 text-xs font-bold leading-5">
                    <span className="min-w-0 break-words">
                      {notification.title}
                    </span>
                    {!notification.readAt && (
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-600"
                        aria-label="تنبيه غير مقروء"
                      />
                    )}
                  </span>
                  <span className="min-w-0 break-words text-[11px] leading-5 text-muted-foreground">
                    {notification.body}
                  </span>
                  {requiresNotificationAction(notification.type) &&
                    !notification.readAt && (
                      <span className="w-fit rounded-md bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-700 dark:text-red-300">
                        بانتظار تأكيد الاستلام أو الرفض
                      </span>
                    )}
                  <span
                    dir="rtl"
                    className="text-[10px] font-medium text-muted-foreground"
                  >
                    {formatNotificationDate(notification.createdAt)}
                  </span>
                </DropdownMenuItem>
              ))}
            </div>
          ) : (
            <div className="px-3 py-6 text-center">
              <Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">لا توجد تنبيهات جديدة</p>
              <p className="mt-1 text-xs text-muted-foreground">
                ستظهر هنا طلبات الإحالة وقرارات السلطة الأعلى.
              </p>
            </div>
          )}
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
            <Menu className="h-[19px] w-[19px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64">
          <DropdownMenuItem
            onSelect={() => {
              window.location.href = "/profile";
            }}
            className="cursor-pointer justify-end gap-2"
          >
            <UserRound className="h-4 w-4" />
            <span>الملف الشخصي</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={toggleTheme}
            className="cursor-pointer justify-end gap-2"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            <span>
              {theme === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void togglePushNotifications()}
            disabled={subscribe.isPending || unsubscribe.isPending}
            className="cursor-pointer justify-end gap-2"
          >
            <Bell className="h-4 w-4" />
            <span>
              {pushEnabled
                ? "إيقاف إشعارات البرقيات"
                : "تفعيل إشعارات البرقيات"}
            </span>
          </DropdownMenuItem>
          {canManageOrganizationSettings && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-right text-xs font-bold text-muted-foreground">
                إعدادات الجهة
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() =>
                  window.dispatchEvent(
                    new CustomEvent("open-department-settings")
                  )
                }
                className="cursor-pointer justify-end gap-2"
              >
                <Settings className="h-4 w-4" />
                <span>إعدادات الجهة</span>
              </DropdownMenuItem>
            </>
          )}
          {canManageUsers && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-right text-xs font-bold text-muted-foreground">
                إعدادات المالك
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() =>
                  window.dispatchEvent(
                    new CustomEvent("open-owner-user-management")
                  )
                }
                className="cursor-pointer justify-end gap-2"
              >
                <Users className="h-4 w-4" />
                <span>إدارة المستخدمين وإضافة الحسابات</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  window.dispatchEvent(
                    new CustomEvent("open-owner-organization-management")
                  )
                }
                className="cursor-pointer justify-end gap-2"
              >
                <Users className="h-4 w-4" />
                <span>إدارة المناطق والأقسام والمخافر</span>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              window.location.href = "/terms";
            }}
            className="cursor-pointer justify-end gap-2"
          >
            <FileText className="h-4 w-4" />
            <span>الشروط والأحكام</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              window.location.href = "/about";
            }}
            className="cursor-pointer justify-end gap-2"
          >
            <Info className="h-4 w-4" />
            <span>حول النظام وميزاته</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => void logout()}
            className="cursor-pointer justify-end gap-2 text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            <span>تسجيل الخروج</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
