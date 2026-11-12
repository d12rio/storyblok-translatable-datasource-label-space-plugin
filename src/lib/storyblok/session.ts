import "server-only";
import { isAppSession, type AppSession } from "@storyblok/app-extension-auth";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { getAuthParams } from "@/auth";

export type SessionRef = { spaceId: number; userId: number };

// app-extension-auth stores the session as a JWT signed with the client secret,
// in a cookie named `${spaceId}:${userId}:${sessionKey}`.
export async function getAppSession({ spaceId, userId }: SessionRef): Promise<AppSession | undefined> {
  const { clientSecret, sessionKey } = getAuthParams();
  const raw = (await cookies()).get(`${spaceId}:${userId}:${sessionKey}`)?.value;
  if (!raw) return;
  try {
    const { data } = jwt.verify(raw, clientSecret) as { data: unknown };
    if (!isAppSession(data) || data.expiresAt < Date.now() + 60_000) return;
    return data;
  } catch {
    return;
  }
}
