import { describe, expect, it } from "vitest";
import {
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

  it("routes urgent-priority telegrams to the urgent channel", () => {
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

  it("treats emergency-category telegrams as urgent even when priority is normal", () => {
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
  });

  it("labels a telegram that is both urgent and emergency without downgrading it", () => {
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
