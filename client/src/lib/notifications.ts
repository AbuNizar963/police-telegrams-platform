export async function showLocalTelegramNotification(input: {
  serialCode: string;
  subject: string;
  telegramId: number;
}): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const options: NotificationOptions = {
    body: `${input.serialCode} — ${input.subject}`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `telegram-${input.telegramId}`,
    dir: "rtl",
    lang: "ar",
    data: { url: `/?telegram=${input.telegramId}` },
  };

  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration) {
      await registration.showNotification("تم تسجيل برقية جديدة", options);
    } else {
      new Notification("تم تسجيل برقية جديدة", options);
    }
  } catch {
    // A local notification is best-effort and must never affect telegram persistence.
  }
}
