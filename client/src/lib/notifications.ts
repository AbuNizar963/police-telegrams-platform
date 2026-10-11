type TelegramNotificationDirection = "outgoing" | "incoming";

let notificationAudioContext: AudioContext | null = null;

/**
 * Plays a short, distinctive two-note chime while the app is open.
 * Background Web Push notifications use the operating system notification
 * channel; browsers do not expose a custom sound option for those alerts.
 */
export async function playTelegramNotificationSound(): Promise<void> {
  if (typeof window === "undefined") return;
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;

  try {
    notificationAudioContext ??= new AudioContextConstructor();
    if (notificationAudioContext.state === "suspended") {
      await notificationAudioContext.resume();
    }
    const context = notificationAudioContext;
    const start = context.currentTime + 0.01;
    const notes = [
      { frequency: 880, offset: 0, duration: 0.16 },
      { frequency: 1174.66, offset: 0.13, duration: 0.24 },
    ];

    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, start + note.offset);
      gain.gain.setValueAtTime(0.0001, start + note.offset);
      gain.gain.exponentialRampToValueAtTime(
        0.075,
        start + note.offset + 0.018
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        start + note.offset + note.duration
      );
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + note.offset);
      oscillator.stop(start + note.offset + note.duration + 0.02);
    }
  } catch {
    // Audio is optional and must never affect telegram creation.
  }
}

function getTelegramNotificationCopy(
  direction: TelegramNotificationDirection
): string {
  return direction === "incoming"
    ? "لقد وردتك برقية"
    : "تم تسجيل برقية صادرة";
}

export async function showLocalTelegramNotification(input: {
  serialCode: string;
  subject: string;
  telegramId: number;
  direction?: TelegramNotificationDirection;
}): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const direction = input.direction ?? "outgoing";
  const title = getTelegramNotificationCopy(direction);
  const options: NotificationOptions = {
    body: `رقم البرقية: ${input.serialCode}\nالموضوع: ${input.subject}`,
    icon: "/notification-icon.png",
    badge: "/notification-icon.png",
    tag: `telegram-${input.telegramId}`,
    silent: false,
    dir: "rtl",
    lang: "ar",
    data: { url: `/?telegram=${input.telegramId}` },
  };

  void playTelegramNotificationSound();
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration) {
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch {
    // A local notification is best-effort and must never affect persistence.
  }
}
