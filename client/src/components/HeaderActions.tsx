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

/**
 * Compact, accessible quick actions displayed in the dashboard's upper corner.
 * Notification and account menus intentionally show only information currently
 * The notification control uses the browser Push API and the registered PWA
 * service worker; it never sends subscription secrets to the client UI.
 */
export default function HeaderActions() {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const notificationConfig = trpc.notifications.config.useQuery(undefined, {
    enabled: Boolean(user),
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
          <DropdownMenuLabel className="text-right">
            الإشعارات
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <div className="px-3 py-6 text-center">
            <Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">
              {pushEnabled
                ? "إشعارات البرقيات مفعّلة"
                : "إشعارات البرقيات غير مفعّلة"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {notificationConfig.data?.enabled
                ? "ستصلك تنبيهات البرقيات الجديدة على هذا الجهاز."
                : "فعّل مفاتيح VAPID على الخادم لإشعارات الخلفية."}
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
          {user?.role === "admin" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-right text-xs font-bold text-[#9b7c3d]">
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
                <span>إدارة حسابات الشرطيين وإضافتها</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  window.dispatchEvent(
                    new CustomEvent("open-department-settings")
                  )
                }
                className="cursor-pointer justify-end gap-2"
              >
                <Settings className="h-4 w-4" />
                <span>إعدادات القسم والموقع</span>
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
