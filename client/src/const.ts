import type { Provider } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export async function startLogin(): Promise<void> {
  const provider = (import.meta.env.VITE_OAUTH_PROVIDER?.trim() || "google") as Provider;
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
    },
  });

  if (error) throw error;
}
