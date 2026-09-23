import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "./env";

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  if (!ENV.supabaseUrl || !ENV.supabaseSecretKey) {
    throw new Error(
      "Supabase server configuration is missing. Set SUPABASE_URL and SUPABASE_SECRET_KEY.",
    );
  }

  client = createClient(ENV.supabaseUrl, ENV.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return client;
}
