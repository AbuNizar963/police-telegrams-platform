import { describe, expect, it } from "vitest";
import {
  canManageTelegramContent,
  isTelegramManagementWindowOpen,
  TELEGRAM_MANAGEMENT_WINDOW_MS,
} from "./telegramPermissions";

describe("telegram content management permissions", () => {
  const now = new Date("2026-10-28T12:00:00.000Z");

  it("allows non-owners through the 48-hour deadline, inclusive", () => {
    const createdAt = new Date(now.getTime() - TELEGRAM_MANAGEMENT_WINDOW_MS);

    expect(isTelegramManagementWindowOpen(createdAt, now)).toBe(true);
    expect(canManageTelegramContent(createdAt, false, now)).toBe(true);
  });

  it("expires non-owner access after the deadline and rejects future dates", () => {
    const expiredAt = new Date(
      now.getTime() - TELEGRAM_MANAGEMENT_WINDOW_MS - 1
    );
    const futureAt = new Date(now.getTime() + 1);

    expect(canManageTelegramContent(expiredAt, false, now)).toBe(false);
    expect(canManageTelegramContent(futureAt, false, now)).toBe(false);
  });

  it("keeps platform-owner access independent of the time window", () => {
    const oldTelegram = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    expect(canManageTelegramContent(oldTelegram, true, now)).toBe(true);
  });
});
