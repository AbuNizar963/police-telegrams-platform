import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

export const supabase: SupabaseClient | null =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

let accessToken: string | null = null;

export function getSupabaseAccessToken() {
  return accessToken;
}

export function setSupabaseAccessToken(token: string | null) {
  accessToken = token;
}

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    setSupabaseAccessToken(session?.access_token ?? null);
  });
}
