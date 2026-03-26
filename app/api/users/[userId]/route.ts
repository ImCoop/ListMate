import { NextResponse } from "next/server";

import { type AppRole } from "@/lib/auth-types";
import { deleteUserById, disableUserById, ensureDefaultAdminUser, listUsers, updateUserRoleById } from "@/lib/instant-admin";
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

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ userId: string }>;
  },
) {
  const authResult = await requireAdmin();

  if (!authResult.ok) {
    return authResult.response;
  }

  const { userId } = await context.params;

  if (!userId) {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }

  await ensureDefaultAdminUser();
  const users = await listUsers();
  const target = users.find((user) => user.id === userId);

  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const payload = (await request.json().catch(() => null)) as { role?: AppRole } | null;
  if (payload && "role" in payload) {
    const role = getNormalizedRole(payload.role);

    if (authResult.user.id === userId && role !== target.role) {
      return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
    }

    if (!target.disabled && target.role === "admin" && role !== "admin") {
      const activeAdminCount = users.filter((user) => user.role === "admin" && !user.disabled).length;
      if (activeAdminCount <= 1) {
        return NextResponse.json({ error: "Cannot demote the last active admin." }, { status: 400 });
      }
    }

    if (target.role === role) {
      return NextResponse.json({ ok: true, user: target });
    }

    await updateUserRoleById(userId, role);

    return NextResponse.json({
      ok: true,
      user: {
        ...target,
        role,
      },
    });
  }

  if (authResult.user.id === userId) {
    return NextResponse.json({ error: "You cannot disable your own account." }, { status: 400 });
  }

  if (!target.disabled && target.role === "admin") {
    const activeAdminCount = users.filter((user) => user.role === "admin" && !user.disabled).length;
    if (activeAdminCount <= 1) {
      return NextResponse.json({ error: "Cannot disable the last active admin." }, { status: 400 });
    }
  }

  if (target.disabled) {
    return NextResponse.json({ ok: true, user: target });
  }

  await disableUserById(userId);

  return NextResponse.json({
    ok: true,
    user: {
      ...target,
      disabled: true,
    },
  });
}

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{ userId: string }>;
  },
) {
  const authResult = await requireAdmin();

  if (!authResult.ok) {
    return authResult.response;
  }

  const { userId } = await context.params;

  if (!userId) {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }

  if (authResult.user.id === userId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  await ensureDefaultAdminUser();
  const users = await listUsers();
  const target = users.find((user) => user.id === userId);

  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (target.role === "admin") {
    const activeAdminCount = users.filter((user) => user.role === "admin" && !user.disabled).length;

    if (activeAdminCount <= 1) {
      return NextResponse.json({ error: "Cannot delete the last active admin." }, { status: 400 });
    }
  }

  await deleteUserById(userId);

  return NextResponse.json({ ok: true });
}
