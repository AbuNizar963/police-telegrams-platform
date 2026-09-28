import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { promisify } from "node:util";
import { parse, serialize } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "police_telegrams_session";
const SESSION_MAX_AGE = 60 * 60 * 12;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function getSessionKey(): Uint8Array {
  if (ENV.authSessionSecret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters");
  }
  return new TextEncoder().encode(ENV.authSessionSecret);
}

export function publicUser(user: User): User {
  const safe = { ...user } as User & {
    passwordHash?: string | null;
  };
  delete safe.passwordHash;
  return safe;
}

export async function setAuthenticatedSession(
  res: Response,
  user: User,
): Promise<void> {
  const token = await new SignJWT({
    role: user.role,
    authUserId: user.authUserId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSessionKey());

  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: ENV.isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    }),
  );
}

export function clearAuthenticatedSession(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: ENV.isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
      expires: new Date(0),
    }),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer;

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, n, r, p, saltText, hashText] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltText || !hashText) {
    return false;
  }

  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  const derived = (await scrypt(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  })) as Buffer;

  return (
    derived.length === expected.length &&
    timingSafeEqual(derived, expected)
  );
}

export async function getAuthenticatedUserFromRequest(
  req: Request,
): Promise<User | null> {
  const token = parse(req.headers.cookie ?? "")[SESSION_COOKIE];
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSessionKey(), {
      algorithms: ["HS256"],
    });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId < 1) return null;

    const user = await db.getUserById(userId);
    return user ? publicUser(user) : null;
  } catch {
    return null;
  }
}

export async function authenticateLocalUser(
  username: string,
  password: string,
): Promise<User | null> {
  const user = await db.getUserByUsername(username);
  if (!user?.passwordHash) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  await db.updateUserLastSignedIn(user.id);
  const refreshed = await db.getUserById(user.id);
  return refreshed ? publicUser(refreshed) : publicUser(user);
}
