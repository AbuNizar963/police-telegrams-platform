import { TRPCError } from "@trpc/server";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import webpush from "web-push";
import {
  deleteMobilePushToken,
  deletePushSubscription,
  listActiveOrganizationMemberIds,
  listAllMobilePushTokens,
  listMobilePushTokens,
  listPushSubscriptions,
  type MobilePushTokenRecord,
  type PushSubscriptionRecord,
} from "../db";
import { ENV } from "./env";
import { isAllowedPushEndpoint } from "./pushEndpoint";

export type NotificationPayload = {
  title: string;
  content: string;
};

type TelegramNotificationDirection = "outgoing" | "incoming";

export const TELEGRAM_ANDROID_GENERAL_CHANNEL_ID = "police_telegram_general_v1";
export const TELEGRAM_ANDROID_URGENT_CHANNEL_ID = "police_telegram_urgent_v1";
export const TELEGRAM_NOTIFICATION_SOUND = "police_telegram_alert";
export const TELEGRAM_IOS_NOTIFICATION_SOUND = "police_telegram_alert.caf";

function getShortTelegramNumber(serialCode: string): string {
  const lastNumericPart = serialCode.match(/(\d+)$/)?.[1];
  return lastNumericPart || serialCode;
}

export function getTelegramNotificationPresentation(input: {
  priority?: string | null;
  category?: string | null;
  direction: TelegramNotificationDirection;
}) {
  const priority = (input.priority ?? "normal").toLowerCase();
  const category = input.category?.toLowerCase() ?? "";
  const isEmergency = category === "emergency";
  const isUrgent = isEmergency || priority === "urgent";
  const title = isEmergency
    ? priority === "urgent"
      ? "برقية طارئة عاجلة"
      : "برقية طارئة"
    : priority === "urgent"
      ? "برقية عاجلة"
      : input.direction === "incoming"
        ? "برقية واردة جديدة"
        : "برقية جديدة";

  return {
    title,
    isUrgent,
    alertLevel: isEmergency ? "emergency" : isUrgent ? "urgent" : "normal",
    androidChannelId: isUrgent
      ? TELEGRAM_ANDROID_URGENT_CHANNEL_ID
      : TELEGRAM_ANDROID_GENERAL_CHANNEL_ID,
    androidSound: TELEGRAM_NOTIFICATION_SOUND,
    iosSound: TELEGRAM_IOS_NOTIFICATION_SOUND,
    iosInterruptionLevel: isUrgent ? "time-sensitive" : "active",
  } as const;
}

function validate(payload: NotificationPayload): NotificationPayload {
  const title = payload.title.trim();
  const content = payload.content.trim();
  if (!title || !content) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title and content are required.",
    });
  }
  if (title.length > 1200 || content.length > 20000) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification payload is too large.",
    });
  }
  return { title, content };
}

export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const body = validate(payload);
  if (!ENV.ownerNotificationWebhookUrl) return false;

  try {
    const response = await fetch(ENV.ownerNotificationWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn(
        "[Notification] Webhook failed",
        response.status,
        response.statusText
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Webhook request failed", error);
    return false;
  }
}

let vapidConfigured = false;
if (ENV.vapidPublicKey && ENV.vapidPrivateKey && ENV.vapidSubject) {
  webpush.setVapidDetails(
    ENV.vapidSubject,
    ENV.vapidPublicKey,
    ENV.vapidPrivateKey
  );
  vapidConfigured = true;
}

let firebaseConfigured = Boolean(
  ENV.firebaseProjectId && ENV.firebaseClientEmail && ENV.firebasePrivateKey
);
if (firebaseConfigured && getApps().length === 0) {
  try {
    initializeApp({
      credential: cert({
        projectId: ENV.firebaseProjectId,
        clientEmail: ENV.firebaseClientEmail,
        privateKey: ENV.firebasePrivateKey,
      }),
    });
  } catch (error) {
    firebaseConfigured = false;
    console.warn("[Notification] Firebase Admin initialization failed", error);
  }
}

async function notifyFirebaseOrganization(
  input: {
    organizationId: string;
    serialCode: string;
    subject: string;
    recipient: string;
    priority?: string | null;
    category?: string | null;
    telegramId: number;
    direction: TelegramNotificationDirection;
  },
  activeRecipientIds: ReadonlySet<number>
): Promise<{
  sent: number;
  removed: number;
  configured: boolean;
}> {
  if (!firebaseConfigured) return { sent: 0, removed: 0, configured: false };
  const tokens = (await listMobilePushTokens(input.organizationId)).filter(
    item => activeRecipientIds.has(item.userId)
  );
  if (tokens.length === 0) return { sent: 0, removed: 0, configured: true };
  const shortNumber = getShortTelegramNumber(input.serialCode);
  const priority = input.priority ?? "normal";
  const presentation = getTelegramNotificationPresentation(input);
  const invalidTokens: MobilePushTokenRecord[] = [];
  let sent = 0;

  // FCM multicast accepts at most 500 registration tokens per request.
  for (let index = 0; index < tokens.length; index += 500) {
    const batch = tokens.slice(index, index + 500);
    let response;
    try {
      response = await getMessaging().sendEachForMulticast({
        tokens: batch.map(item => item.token),
        notification: {
          title: presentation.title,
          // Telegram subjects may contain sensitive operational details. Keep
          // lock-screen notifications useful without exposing the document.
          body: `رقم البرقية: ${shortNumber}\nوصلت برقية جديدة، اضغط لعرض التفاصيل.`,
        },
        data: {
          type:
            input.direction === "incoming"
              ? "telegram.incoming"
              : "telegram.created",
          telegramId: String(input.telegramId),
          serialCode: input.serialCode,
          priority,
          category: input.category ?? "",
          alertLevel: presentation.alertLevel,
        },
        android: {
          priority: presentation.isUrgent ? "high" : "normal",
          ttl: 300_000,
          notification: {
            channelId: presentation.androidChannelId,
            sound: presentation.androidSound,
            visibility: "private",
            tag: `telegram-${input.telegramId}`,
          },
        },
        apns: {
          headers: {
            "apns-priority": presentation.isUrgent ? "10" : "5",
            "apns-push-type": "alert",
            "apns-expiration": String(Math.floor(Date.now() / 1000) + 300),
          },
          payload: {
            aps: {
              sound: presentation.iosSound,
              badge: 1,
              threadId: `telegram-${input.telegramId}`,
              "interruption-level": presentation.iosInterruptionLevel,
            },
          },
        },
      });
    } catch (error) {
      console.warn("[Notification] Firebase delivery batch failed", error);
      continue;
    }

    sent += response.successCount;
    response.responses.forEach((result, responseIndex) => {
      const token = batch[responseIndex];
      const invalidCode = [
        "messaging/registration-token-not-registered",
        "messaging/invalid-registration-token",
      ].includes(result.error?.code ?? "");
      if (!result.success && invalidCode && token) invalidTokens.push(token);
    });
  }

  await Promise.all(
    invalidTokens.map(({ token, userId }) =>
      deleteMobilePushToken(token, userId)
    )
  );
  return {
    sent,
    removed: invalidTokens.length,
    configured: true,
  };
}

export function getWebPushPublicKey(): string | null {
  return vapidConfigured ? ENV.vapidPublicKey : null;
}

export async function notifyOrganizationTelegramCreated(input: {
  organizationId: string;
  serialCode: string;
  subject: string;
  recipient: string;
  priority?: string | null;
  category?: string | null;
  telegramId: number;
  direction?: TelegramNotificationDirection;
}): Promise<{ sent: number; removed: number; configured: boolean }> {
  if (!vapidConfigured && !firebaseConfigured) {
    return { sent: 0, removed: 0, configured: false };
  }
  const direction = input.direction ?? "outgoing";
  const priority = input.priority ?? "normal";
  const activeRecipientIds = new Set(
    await listActiveOrganizationMemberIds(input.organizationId)
  );
  const presentation = getTelegramNotificationPresentation({
    priority,
    category: input.category,
    direction,
  });
  const firebaseResult = await notifyFirebaseOrganization(
    {
      ...input,
      priority,
      direction,
    },
    activeRecipientIds
  );
  if (!vapidConfigured) {
    return firebaseResult;
  }

  const subscriptions = (
    await listPushSubscriptions(input.organizationId)
  ).filter(subscription => activeRecipientIds.has(subscription.userId));
  const shortNumber = getShortTelegramNumber(input.serialCode);
  const payload = JSON.stringify({
    type: "telegram.created",
    title: presentation.title,
    body: `رقم البرقية: ${shortNumber}\nوصلت برقية جديدة، اضغط لعرض التفاصيل.`,
    tag: `telegram-${input.telegramId}`,
    url: `/?telegram=${input.telegramId}`,
    data: {
      telegramId: input.telegramId,
      serialCode: input.serialCode,
      priority,
      category: input.category ?? "",
      alertLevel: presentation.alertLevel,
    },
  });
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subscriptions.map(async (subscription: PushSubscriptionRecord) => {
      if (!isAllowedPushEndpoint(subscription.endpoint)) {
        try {
          await deletePushSubscription(
            subscription.userId,
            subscription.endpoint
          );
        } catch (error) {
          console.warn(
            "[Notification] Rejected push endpoint cleanup failed",
            error
          );
        }
        removed += 1;
        return;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 300 }
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await deletePushSubscription(
            subscription.userId,
            subscription.endpoint
          );
          removed += 1;
        } else {
          console.warn("[Notification] Web Push delivery failed", error);
        }
      }
    })
  );
  return {
    sent: sent + firebaseResult.sent,
    removed: removed + firebaseResult.removed,
    configured: true,
  };
}
export async function notifyOrganizationRouteEvent(input: {
  organizationId: string;
  type: "route.requested" | "route.approved" | "route.rejected";
  title: string;
  body: string;
  telegramId: number;
  serialCode: string;
  routeId: number;
  routeSerialCode?: string | null;
}): Promise<{ sent: number; removed: number; configured: boolean }> {
  if (!vapidConfigured && !firebaseConfigured) {
    return { sent: 0, removed: 0, configured: false };
  }
  const activeRecipientIds = new Set(
    await listActiveOrganizationMemberIds(input.organizationId)
  );
  const firebaseResult = await notifyFirebaseRouteEvent(
    input,
    activeRecipientIds
  );
  if (!vapidConfigured) return firebaseResult;

  const subscriptions = (
    await listPushSubscriptions(input.organizationId)
  ).filter(subscription => activeRecipientIds.has(subscription.userId));
  const body = getRouteNotificationBody(input.serialCode);
  const payload = JSON.stringify({
    type: `telegram.${input.type}`,
    title: input.title,
    body,
    tag: `telegram-route-${input.routeId}-${input.type}`,
    url: `/?telegram=${input.telegramId}`,
    data: {
      telegramId: input.telegramId,
      serialCode: input.serialCode,
      routeId: input.routeId,
      routeSerialCode: input.routeSerialCode ?? "",
    },
  });
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subscriptions.map(async subscription => {
      if (!isAllowedPushEndpoint(subscription.endpoint)) {
        try {
          await deletePushSubscription(
            subscription.userId,
            subscription.endpoint
          );
        } catch (error) {
          console.warn(
            "[Notification] Rejected push endpoint cleanup failed",
            error
          );
        }
        removed += 1;
        return;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: 300 }
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await deletePushSubscription(
            subscription.userId,
            subscription.endpoint
          );
          removed += 1;
        } else {
          console.warn("[Notification] Route push delivery failed", error);
        }
      }
    })
  );
  return {
    sent: sent + firebaseResult.sent,
    removed: removed + firebaseResult.removed,
    configured: true,
  };
}

type RouteNotificationInput = {
  organizationId: string;
  type: "route.requested" | "route.approved" | "route.rejected";
  title: string;
  body: string;
  telegramId: number;
  serialCode: string;
  routeId: number;
  routeSerialCode?: string | null;
};

function getRouteNotificationBody(serialCode: string): string {
  const shortNumber = getShortTelegramNumber(serialCode);
  return `رقم البرقية: ${shortNumber}\nيوجد تحديث على مسار البرقية. افتح التطبيق لعرض التفاصيل.`;
}

export function buildRouteFirebaseMessage(input: RouteNotificationInput) {
  const tag = `telegram-route-${input.routeId}-${input.type}`;
  return {
    notification: {
      title: input.title.trim() || "تحديث مسار البرقية",
      body: getRouteNotificationBody(input.serialCode),
    },
    data: {
      type: `telegram.${input.type}`,
      telegramId: String(input.telegramId),
      serialCode: input.serialCode,
      routeId: String(input.routeId),
      routeSerialCode: input.routeSerialCode ?? "",
    },
    android: {
      priority: "normal" as const,
      ttl: 300_000,
      notification: {
        channelId: TELEGRAM_ANDROID_GENERAL_CHANNEL_ID,
        sound: TELEGRAM_NOTIFICATION_SOUND,
        visibility: "private" as const,
        tag,
      },
    },
    apns: {
      headers: {
        "apns-priority": "5",
        "apns-push-type": "alert",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 300),
      },
      payload: {
        aps: {
          sound: TELEGRAM_IOS_NOTIFICATION_SOUND,
          badge: 1,
          threadId: `telegram-${input.telegramId}`,
          "interruption-level": "active",
        },
      },
    },
  };
}

async function notifyFirebaseRouteEvent(
  input: RouteNotificationInput,
  activeRecipientIds: ReadonlySet<number>
): Promise<{ sent: number; removed: number; configured: boolean }> {
  if (!firebaseConfigured) return { sent: 0, removed: 0, configured: false };
  const tokens = (await listMobilePushTokens(input.organizationId)).filter(
    item => activeRecipientIds.has(item.userId)
  );
  if (tokens.length === 0) return { sent: 0, removed: 0, configured: true };

  const invalidTokens: MobilePushTokenRecord[] = [];
  let sent = 0;
  for (let index = 0; index < tokens.length; index += 500) {
    const batch = tokens.slice(index, index + 500);
    let response;
    try {
      response = await getMessaging().sendEachForMulticast({
        tokens: batch.map(item => item.token),
        ...buildRouteFirebaseMessage(input),
      });
    } catch (error) {
      console.warn(
        "[Notification] Firebase route delivery batch failed",
        error
      );
      continue;
    }

    sent += response.successCount;
    response.responses.forEach((result, responseIndex) => {
      const token = batch[responseIndex];
      const invalidCode = [
        "messaging/registration-token-not-registered",
        "messaging/invalid-registration-token",
      ].includes(result.error?.code ?? "");
      if (!result.success && invalidCode && token) invalidTokens.push(token);
    });
  }

  await Promise.all(
    invalidTokens.map(({ token, userId }) =>
      deleteMobilePushToken(token, userId)
    )
  );
  return { sent, removed: invalidTokens.length, configured: true };
}

export async function notifyMobileRelease(input: {
  version: string;
  buildNumber: number;
  releaseUrl: string;
  title?: string;
  body?: string;
}): Promise<{ sent: number; removed: number; configured: boolean }> {
  if (!firebaseConfigured) return { sent: 0, removed: 0, configured: false };

  const tokens = await listAllMobilePushTokens();
  if (tokens.length === 0) return { sent: 0, removed: 0, configured: true };

  const invalidTokens: MobilePushTokenRecord[] = [];
  let sent = 0;
  for (let index = 0; index < tokens.length; index += 500) {
    const batch = tokens.slice(index, index + 500);
    const response = await getMessaging().sendEachForMulticast({
      tokens: batch.map(item => item.token),
      notification: {
        title: input.title?.trim() || "تحديث جديد لتطبيق برقيات الشرطة",
        body:
          input.body?.trim() ||
          `الإصدار ${input.version}+${input.buildNumber} متوفر الآن. اضغط لمعرفة التفاصيل.`,
      },
      data: {
        type: "app.update",
        version: input.version,
        buildNumber: String(input.buildNumber),
        releaseUrl: input.releaseUrl,
      },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default", badge: 1 } } },
    });

    sent += response.successCount;
    response.responses.forEach((result, responseIndex) => {
      const invalidCode = [
        "messaging/registration-token-not-registered",
        "messaging/invalid-registration-token",
      ].includes(result.error?.code ?? "");
      const token = batch[responseIndex];
      if (!result.success && invalidCode && token) invalidTokens.push(token);
    });
  }

  await Promise.all(
    invalidTokens.map(({ token, userId }) =>
      deleteMobilePushToken(token, userId)
    )
  );
  return { sent, removed: invalidTokens.length, configured: true };
}
