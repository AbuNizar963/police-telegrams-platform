import { TRPCError } from "@trpc/server";
import webpush from "web-push";
import {
  deletePushSubscription,
  listPushSubscriptions,
  type PushSubscriptionRecord,
} from "../db";
import { ENV } from "./env";

export type NotificationPayload = {
  title: string;
  content: string;
};

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
}): Promise<{ sent: number; removed: number; configured: boolean }> {
  if (!vapidConfigured) {
    return { sent: 0, removed: 0, configured: false };
  }

  const subscriptions = await listPushSubscriptions(input.organizationId);
  const payload = JSON.stringify({
    type: "telegram.created",
    title: "برقية شرطية جديدة",
    body: `${input.serialCode} — ${input.subject}`,
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
  return { sent, removed, configured: true };
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
