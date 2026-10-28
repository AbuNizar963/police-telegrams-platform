import { describe, expect, it } from "vitest";
import {
  buildRouteFirebaseMessage,
  getTelegramNotificationPresentation,
  TELEGRAM_ANDROID_GENERAL_CHANNEL_ID,
  TELEGRAM_ANDROID_URGENT_CHANNEL_ID,
  TELEGRAM_IOS_NOTIFICATION_SOUND,
  TELEGRAM_NOTIFICATION_SOUND,
} from "./notification";

describe("telegram push notification presentation", () => {
  it("uses the general channel and product sound for ordinary incoming telegrams", () => {
    expect(
      getTelegramNotificationPresentation({
        priority: "normal",
        category: "administrative",
        direction: "incoming",
      })
    ).toEqual({
      title: "برقية واردة جديدة",
      isUrgent: false,
      alertLevel: "normal",
      androidChannelId: TELEGRAM_ANDROID_GENERAL_CHANNEL_ID,
      androidSound: TELEGRAM_NOTIFICATION_SOUND,
      iosSound: TELEGRAM_IOS_NOTIFICATION_SOUND,
      iosInterruptionLevel: "active",
    });
  });

  it("defaults missing legacy priorities to an ordinary notification", () => {
    const presentation = getTelegramNotificationPresentation({
      direction: "outgoing",
    });

    expect(presentation.title).toBe("برقية جديدة");
    expect(presentation.alertLevel).toBe("normal");
    expect(presentation.androidChannelId).toBe(
      TELEGRAM_ANDROID_GENERAL_CHANNEL_ID
    );
  });

  it("routes urgent-priority telegrams to the urgent channel and time-sensitive APNs", () => {
    const presentation = getTelegramNotificationPresentation({
      priority: "urgent",
      category: "security",
      direction: "outgoing",
    });

    expect(presentation.title).toBe("برقية عاجلة");
    expect(presentation.isUrgent).toBe(true);
    expect(presentation.alertLevel).toBe("urgent");
    expect(presentation.androidChannelId).toBe(
      TELEGRAM_ANDROID_URGENT_CHANNEL_ID
    );
    expect(presentation.iosInterruptionLevel).toBe("time-sensitive");
  });

  it("treats emergency-category telegrams as urgent when priority is normal", () => {
    const presentation = getTelegramNotificationPresentation({
      priority: "normal",
      category: "emergency",
      direction: "incoming",
    });

    expect(presentation.title).toBe("برقية طارئة");
    expect(presentation.isUrgent).toBe(true);
    expect(presentation.alertLevel).toBe("emergency");
    expect(presentation.androidChannelId).toBe(
      TELEGRAM_ANDROID_URGENT_CHANNEL_ID
    );
    expect(presentation.iosInterruptionLevel).toBe("time-sensitive");
  });

  it("keeps both urgency signals in the emergency title", () => {
    const presentation = getTelegramNotificationPresentation({
      priority: "urgent",
      category: "emergency",
      direction: "outgoing",
    });

    expect(presentation.title).toBe("برقية طارئة عاجلة");
    expect(presentation.alertLevel).toBe("emergency");
    expect(presentation.androidChannelId).toBe(
      TELEGRAM_ANDROID_URGENT_CHANNEL_ID
    );
  });
});

describe("route event FCM message", () => {
  it("sends a private, short-lived route update without exposing its detail body", () => {
    const message = buildRouteFirebaseMessage({
      organizationId: "550e8400-e29b-41d4-a716-446655440000",
      type: "route.approved",
      title: "تم اعتماد الإحالة",
      body: "تفاصيل تشغيلية خاصة لا يجب عرضها على شاشة القفل",
      telegramId: 42,
      serialCode: "POL-2026-00123",
      routeId: 7,
      routeSerialCode: "ROUTE-7",
    });

    expect(message.notification.title).toBe("تم اعتماد الإحالة");
    expect(message.notification.body).toContain("123");
    expect(message.notification.body).not.toContain("تفاصيل تشغيلية");
    expect(message.data).toEqual({
      type: "telegram.route.approved",
      telegramId: "42",
      serialCode: "POL-2026-00123",
      routeId: "7",
      routeSerialCode: "ROUTE-7",
    });
    expect(
      Object.values(message.data).every(value => typeof value === "string")
    ).toBe(true);
    expect(message.android.priority).toBe("normal");
    expect(message.android.ttl).toBe(300_000);
    expect(message.android.notification.visibility).toBe("private");
    expect(message.apns.headers["apns-priority"]).toBe("5");
  });
});
