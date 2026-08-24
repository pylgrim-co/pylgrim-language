import { NextResponse } from "next/server";
import type { SessionUser } from "../types";

/**
 * Identity in the open-source edition: there isn't any.
 *
 * A self-hosted install serves one person — whoever runs it. There is no
 * sign-up, no session and no user table, so every request is that person
 * and the gate always opens. The constant id exists only so the rows and
 * log lines that want a user field have something stable to put there.
 *
 * Anyone needing multi-user isolation wants a real auth layer in front of
 * the app (a reverse proxy with SSO is the usual answer), not a login
 * screen bolted onto local storage.
 */

export const LOCAL_USER: SessionUser = { id: "local", email: null };

export async function currentSessionUser(): Promise<SessionUser | null> {
  return LOCAL_USER;
}

export async function currentUserId(): Promise<string | null> {
  return LOCAL_USER.id;
}

export async function requireUserId(): Promise<{ userId: string } | { response: Response }> {
  return { userId: LOCAL_USER.id };
}

/**
 * Never reached in this edition — kept because the seam declares it, and
 * because a route that somehow calls it should refuse rather than crash.
 */
export function unauthorized(): Response {
  return NextResponse.json({ error: "not signed in" }, { status: 401 });
}
