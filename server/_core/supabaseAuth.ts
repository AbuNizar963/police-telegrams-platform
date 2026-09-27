import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const supabase =
  ENV.supabaseUrl && ENV.supabasePublishableKey
    ? createClient(ENV.supabaseUrl, ENV.supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const isSupabaseAuthConfigured = Boolean(supabase);

function getBearerToken(req: Request) {
  const header = req.headers.authorization;
  return typeof header === "string" && header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : null;
}

export async function authenticateSupabaseRequest(
  req: Request
): Promise<User | null> {
  if (!supabase) return null;
  const token = getBearerToken(req);
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    console.warn("[Supabase Auth] Token verification failed", error?.message);
    return null;
  }

  const authUser = data.user;
  const metadata = authUser.user_metadata ?? {};
  const name =
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    (typeof metadata.name === "string" && metadata.name) ||
    authUser.email ||
    "مستخدم النظام";
  const provider =
    typeof authUser.app_metadata?.provider === "string"
      ? authUser.app_metadata.provider
      : "email";

  await db.upsertUser({
    openId: authUser.id,
    name,
    email: authUser.email ?? null,
    loginMethod: provider,
    lastSignedIn: new Date(),
  });

  return (await db.getUserByOpenId(authUser.id)) ?? null;
}
