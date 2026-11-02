import { toast as sonnerToast, type ExternalToast } from "sonner";

type NotificationOptions = ExternalToast;

function notify(
  type: "success" | "error" | "info" | "warning",
  message: string,
  options?: NotificationOptions
) {
  const titles = {
    success: "تم بنجاح",
    error: "حدث خطأ",
    info: "معلومة",
    warning: "تنبيه",
  } as const;

  sonnerToast[type](titles[type], {
    ...options,
    description: message,
  });
}

export const toast = {
  success: (message: string, options?: NotificationOptions) =>
    notify("success", message, options),
  error: (message: string, options?: NotificationOptions) =>
    notify("error", message, options),
  info: (message: string, options?: NotificationOptions) =>
    notify("info", message, options),
  warning: (message: string, options?: NotificationOptions) =>
    notify("warning", message, options),
};
