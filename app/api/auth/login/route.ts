import { NextResponse } from "next/server";

import { ensureDefaultAdminUser, findUserByUsername } from "@/lib/instant-admin";
import { verifyPassword } from "@/lib/password";
import { createSessionToken, getSessionCookieOptions, sessionCookie } from "@/lib/server-auth";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
    const username = payload?.username?.trim();
    const password = payload?.password;

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
    }

    await ensureDefaultAdminUser();
    const user = await findUserByUsername(username);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }

    if (user.disabled) {
      return NextResponse.json({ error: "This account is disabled." }, { status: 403 });
    }

    const token = createSessionToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });
    const response = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });

    response.cookies.set(sessionCookie.name, token, getSessionCookieOptions(request, sessionCookie.maxAgeSeconds));

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed.";
    console.error("Login route error:", message);
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === "production" ? "Login failed." : message,
      },
      { status: 500 },
    );
  }
}
