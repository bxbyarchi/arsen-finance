import crypto from "crypto";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export interface SessionData {
  user: AuthUser;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export async function getLocalUser(): Promise<AuthUser> {
  const id = process.env.ARSEN_USER_ID ?? "arsen-admin";
  const email = process.env.ARSEN_USER_EMAIL ?? "admin@arsen.local";
  const firstName = process.env.ARSEN_USER_FIRST_NAME ?? "Арсен";
  const lastName = process.env.ARSEN_USER_LAST_NAME ?? null;

  const values = {
    id,
    email,
    firstName,
    lastName,
    profileImageUrl: null,
  };

  const [user] = await db.insert(usersTable).values(values)
    .onConflictDoUpdate({ target: usersTable.id, set: { ...values, updatedAt: new Date() } })
    .returning();

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
  };
}

export function verifyLocalPassword(password: unknown): boolean {
  const expected = process.env.ARSEN_AUTH_PASSWORD;
  if (typeof password !== "string" || !expected) return false;
  const actualBuffer = Buffer.from(password);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.sid, sid));
  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }
  return row.sess as unknown as SessionData;
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function clearSession(res: Response, sid?: string): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionId(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE];
}