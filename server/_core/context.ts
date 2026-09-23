import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { getSupabaseAdmin } from "./supabase";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function getBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  const token = getBearerToken(opts.req.headers.authorization);
  if (!token) return { ...opts, user: null };

  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) return { ...opts, user: null };

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
        typeof appMetadata.provider === "string" ? appMetadata.provider : "supabase",
      lastSignedIn: new Date(),
    });

    const user = await db.getUserByAuthUserId(authUser.id);
    return { ...opts, user: user ?? null };
  } catch (error) {
    console.warn("[Auth] Supabase authentication failed", error);
    return { ...opts, user: null };
  }
}
