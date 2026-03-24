import { NextResponse } from "next/server";

import { createUser, createUserId, ensureDefaultAdminUser, findUserByUsername, listUsers } from "@/lib/instant-admin";
import { type AppRole } from "@/lib/auth-types";
import { hashPassword } from "@/lib/password";
import { getSessionUser } from "@/lib/server-auth";

function getNormalizedRole(value: unknown): AppRole {
  return value === "admin" ? "admin" : "user";
}

async function requireAdmin() {
  const user = await getSessionUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  if (user.role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }

  return { ok: true as const, user };
}

export async function GET() {
  const authResult = await requireAdmin();

  if (!authResult.ok) {
    return authResult.response;
  }

  await ensureDefaultAdminUser();
  const users = await listUsers();

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      disabled: user.disabled,
      createdAt: user.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const authResult = await requireAdmin();

  if (!authResult.ok) {
    return authResult.response;
  }

  const payload = (await request.json().catch(() => null)) as {
    username?: string;
    password?: string;
    role?: AppRole;
  } | null;
  const username = payload?.username?.trim();
  const password = payload?.password;
  const role = getNormalizedRole(payload?.role);

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await findUserByUsername(username);

  if (existing) {
    return NextResponse.json({ error: "Username already exists." }, { status: 409 });
  }

  const userId = createUserId();
  const createdAt = Date.now();

  await createUser({
    id: userId,
    username,
    passwordHash: hashPassword(password),
    role,
    disabled: false,
    createdAt,
  });

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: userId,
        username,
        role,
        disabled: false,
        createdAt,
      },
    },
    { status: 201 },
  );
}
