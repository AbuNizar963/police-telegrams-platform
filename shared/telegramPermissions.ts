export const TELEGRAM_MANAGEMENT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Whether a non-owner may manage a telegram within the server's time window. */
export function isTelegramManagementWindowOpen(
  createdAt: Date,
  now: Date = new Date()
): boolean {
  const ageMs = now.getTime() - createdAt.getTime();
  return ageMs >= 0 && ageMs <= TELEGRAM_MANAGEMENT_WINDOW_MS;
}

/** Mirrors the authorization rule enforced by the telegram mutation routes. */
export function canManageTelegramContent(
  createdAt: Date,
  isPlatformOwner: boolean,
  now: Date = new Date()
): boolean {
  return isPlatformOwner || isTelegramManagementWindowOpen(createdAt, now);
}
