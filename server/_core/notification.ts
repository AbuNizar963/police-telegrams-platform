import { TRPCError } from "@trpc/server";
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

export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const body = validate(payload);
  if (!ENV.ownerNotificationWebhookUrl) return false;

  try {
    const response = await fetch(ENV.ownerNotificationWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn("[Notification] Webhook failed", response.status, response.statusText);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Webhook request failed", error);
    return false;
  }
}
