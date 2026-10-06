const splitCsv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);

export const ENV = {
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
  supabaseStorageBucket:
    process.env.SUPABASE_STORAGE_BUCKET ?? "telegram-files",
  adminEmails: splitCsv(process.env.ADMIN_EMAILS),
  authSessionSecret: process.env.AUTH_SESSION_SECRET ?? "",
  ownerUsername: process.env.OWNER_USERNAME ?? "AbuNizar",
  ownerPasswordHash: process.env.OWNER_PASSWORD_HASH ?? "",
  ownerInitialPassword: process.env.OWNER_INITIAL_PASSWORD ?? "",
  ownerNotificationWebhookUrl: process.env.OWNER_NOTIFICATION_WEBHOOK_URL ?? "",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  // AI credentials and private companion-service endpoints are server-only.
  // Never mirror them through a VITE_ variable.
  cohereApiKey: process.env.COHERE_API_KEY ?? "",
  paddleOcrVlUrl: process.env.PADDLEOCR_VL_URL ?? "",
  aiInputServiceToken: process.env.AI_INPUT_SERVICE_TOKEN ?? "",
  isProduction: process.env.NODE_ENV === "production",
};
