import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getAuthenticatedUserFromRequest, type PublicUser } from "./auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: PublicUser | null;
};

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  const user = await getAuthenticatedUserFromRequest(opts.req);
  return { ...opts, user };
}
