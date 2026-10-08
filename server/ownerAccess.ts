import { ENV } from "./_core/env";
import { getSupabaseAdmin } from "./_core/supabase";

export interface OwnerIdentity {
  role?: string | null;
  username?: string | null;
}

/** Owner-only operations must match the configured owner account, not every admin. */
export function isPlatformOwner(
  user: OwnerIdentity | null | undefined
): boolean {
  const configuredOwner = ENV.ownerUsername.trim().toLowerCase();
  return (
    user?.role === "admin" &&
    typeof user.username === "string" &&
    user.username.trim().toLowerCase() === configuredOwner
  );
}

export async function isPlatformOwnerUserId(userId: number): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("id, username, role")
    .eq("id", userId)
    .maybeSingle();

  if (error)
    throw new Error(`Failed to inspect membership target: ${error.message}`);
  return isPlatformOwner(data as OwnerIdentity | null);
}
