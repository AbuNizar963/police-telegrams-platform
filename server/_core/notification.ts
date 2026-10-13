import { TRPCError } from "@trpc/server";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import webpush from "web-push";
import {
  deleteMobilePushToken,
  deletePushSubscription,
  listMobilePushTokens,
  listPushSubscriptions,
  type PushSubscriptionRecord,
} from "../db";
import { ENV } from "./env";
import { isAllowedPushEndpoint } from "./pushEndpoint";

export type NotificationPayload = {
  title: string;
  content: string;
};

type TelegramNotificationDirection = "outgoing" | "incoming";

function getShortTelegramNumber(serialCode: string): string {
  const lastNumericPart = serialCode.match(/(\d+)$/)?.[1];
  return lastNumericPart || serialCode;
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

const firebaseConfigured = Boolean(
  ENV.firebaseProjectId && ENV.firebaseClientEmail && ENV.firebasePrivateKey
);
if (firebaseConfigured && getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: ENV.firebaseProjectId,
      clientEmail: ENV.firebaseClientEmail,
      privateKey: ENV.firebasePrivateKey,
    }),
  });
}

async function notifyFirebaseOrganization(input: {
  organizationId: string;
  serialCode: string;
  subject: string;
  recipient: string;
  priority: string;
  telegramId: number;
  direction: TelegramNotificationDirection;
}): Promise<{ sent: number; removed: number; configured: boolean }> {
  if (!firebaseConfigured) return { sent: 0, removed: 0, configured: false };
  const tokens = await listMobilePushTokens(input.organizationId);
  if (tokens.length === 0) return { sent: 0, removed: 0, configured: true };
  const shortNumber = getShortTelegramNumber(input.serialCode);
  const response = await getMessaging().sendEachForMulticast({
    tokens: tokens.map(item => item.token),
    notification: {
      title: input.direction === "incoming" ? "برقية واردة جديدة" : "برقية جديدة",
      body: `رقم البرقية: ${shortNumber}\nالموضوع: ${input.subject}`,
    },
    data: {
      type: "telegram.incoming",
      telegramId: String(input.telegramId),
      serialCode: input.serialCode,
      recipient: input.recipient,
      priority: input.priority,
    },
    android: { priority: "high" },
    apns: { payload: { aps: { sound: "default", badge: 1 } } },
  });
  const invalidTokens = response.responses
    .map((result, index) =>
      !result.success &&
      (result.error?.code === "messaging/registration-token-not-registered" ||
        result.error?.code === "messaging/invalid-registration-token")
        ? tokens[index]?.token
        : null
    )
    .filter((token): token is string => Boolean(token));
  await Promise.all(invalidTokens.map(token => deleteMobilePushToken(token)));
  return {
    sent: response.successCount,
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
  priority: string;
  telegramId: number;
  direction?: TelegramNotificationDirection;
}): Promise<{ sent: number; removed: number; configured: boolean }> {
  const direction = input.direction ?? "outgoing";
  const firebaseResult = await notifyFirebaseOrganization({
    ...input,
    direction,
  });
  if (!vapidConfigured) {
    return firebaseResult;
  }

  const subscriptions = await listPushSubscriptions(input.organizationId);
  const shortNumber = getShortTelegramNumber(input.serialCode);
  const payload = JSON.stringify({
    type: "telegram.created",
    title: direction === "incoming" ? "برقية واردة" : "برقية صادرة",
    body: `رقم البرقية: ${shortNumber}\nالموضوع: ${input.subject}`,
    tag: `telegram-${input.telegramId}`,
    url: `/?telegram=${input.telegramId}`,
    data: {
      telegramId: input.telegramId,
      serialCode: input.serialCode,
      recipient: input.recipient,
      priority: input.priority,
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
  if (!vapidConfigured) {
    return { sent: 0, removed: 0, configured: false };
  }
  const subscriptions = await listPushSubscriptions(input.organizationId);
  const payload = JSON.stringify({
    type: `telegram.${input.type}`,
    title: input.title,
    body: input.body,
    tag: `telegram-route-${input.routeId}-${input.type}`,
    url: `/?telegram=${input.telegramId}`,
    data: {
      telegramId: input.telegramId,
      serialCode: input.serialCode,
      routeId: input.routeId,
      routeSerialCode: input.routeSerialCode ?? null,
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
  return { sent, removed, configured: true };
}
