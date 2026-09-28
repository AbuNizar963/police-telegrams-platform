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
  ownerNotificationWebhookUrl:
    process.env.OWNER_NOTIFICATION_WEBHOOK_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
};
