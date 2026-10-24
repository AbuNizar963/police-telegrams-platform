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
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
  firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(
    /\\n/g,
    "\n"
  ),
  releaseNotificationSecret: process.env.RELEASE_NOTIFICATION_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
};

export function assertProductionEnvironment(env: typeof ENV = ENV): void {
  if (!env.isProduction) return;

  const missing: string[] = [];
  let parsedSupabaseUrl: URL | undefined;

  if (!env.supabaseUrl.trim()) {
    missing.push("SUPABASE_URL");
  } else {
    try {
      parsedSupabaseUrl = new URL(env.supabaseUrl);
    } catch {
      throw new Error("SUPABASE_URL must be a valid absolute URL in production");
    }
    if (parsedSupabaseUrl.protocol !== "https:") {
      throw new Error("SUPABASE_URL must use HTTPS in production");
    }
  }

  if (!env.supabaseSecretKey.trim()) missing.push("SUPABASE_SECRET_KEY");
  if (env.authSessionSecret.length < 32) {
    missing.push("AUTH_SESSION_SECRET (at least 32 characters)");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing or invalid production environment configuration: ${missing.join(", ")}`
    );
  }
}
