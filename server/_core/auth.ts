import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { getSupabaseAdmin } from "./supabase";

function getBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function getAuthenticatedUserFromRequest(
  req: Request,
): Promise<User | null> {
  const token = getBearerToken(req.headers.authorization);
  if (!token) return null;

  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) return null;

    const authUser = data.user;
    const metadata = authUser.user_metadata ?? {};
    const appMetadata = authUser.app_metadata ?? {};
    const name =
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : authUser.email?.split("@")[0] ?? null;

    await db.upsertUser({
      authUserId: authUser.id,
      name,
      email: authUser.email ?? null,
      loginMethod:
        typeof appMetadata.provider === "string"
          ? appMetadata.provider
          : "supabase",
      lastSignedIn: new Date(),
    });

    return (await db.getUserByAuthUserId(authUser.id)) ?? null;
  } catch (error) {
    console.warn("[Auth] Supabase authentication failed", error);
    return null;
  }
}
