import { id, init } from "@instantdb/admin";

import type { AppRole, AppUserRecord } from "@/lib/auth-types";
import { hashPassword } from "@/lib/password";

let cachedAdminDb: ReturnType<typeof init> | null = null;

function getAdminDb() {
  if (cachedAdminDb) {
    return cachedAdminDb;
  }

  const instantAppId = process.env.INSTANT_APP_ID || process.env.NEXT_PUBLIC_INSTANT_APP_ID;
  const instantAdminToken = process.env.INSTANT_APP_ADMIN_TOKEN;

  if (!instantAppId) {
    throw new Error("Missing INSTANT_APP_ID or NEXT_PUBLIC_INSTANT_APP_ID.");
  }

  if (!instantAdminToken) {
    throw new Error("Missing INSTANT_APP_ADMIN_TOKEN.");
  }

  cachedAdminDb = init({
    appId: instantAppId,
    adminToken: instantAdminToken,
  });

  return cachedAdminDb;
}

export function createUserId() {
  return id();
}

function normalizeRole(value: unknown): AppRole {
  return value === "admin" ? "admin" : "user";
}

function normalizeUserRecord(value: unknown): AppUserRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AppUserRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.username !== "string" ||
    typeof candidate.passwordHash !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    username: candidate.username,
    passwordHash: candidate.passwordHash,
    role: normalizeRole(candidate.role),
    disabled: Boolean(candidate.disabled),
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : Date.now(),
  };
}

export async function listUsers() {
  const data = await getAdminDb().query({ app_users: {} });
  const users = (data.app_users as unknown[] | undefined) ?? [];
  return users.map(normalizeUserRecord).filter((user): user is AppUserRecord => Boolean(user));
}

export async function findUserByUsername(username: string) {
  const normalizedUsername = username.trim().toLowerCase();
  const users = await listUsers();
  return users.find((user) => user.username.toLowerCase() === normalizedUsername) || null;
}

export async function ensureDefaultAdminUser() {
  const users = await listUsers();

  if (users.length > 0) {
    return users;
  }

  const username = process.env.LISTMATE_DEFAULT_ADMIN_USERNAME || "admin";
  const password = process.env.LISTMATE_DEFAULT_ADMIN_PASSWORD || "admin1234!";
  const userId = createUserId();
  const record: AppUserRecord = {
    id: userId,
    username,
    passwordHash: hashPassword(password),
    role: "admin",
    disabled: false,
    createdAt: Date.now(),
  };

  const db = getAdminDb();
  await db.transact(db.tx.app_users[userId].update(record));

  return [record];
}

export async function createUser(input: {
  id: string;
  username: string;
  passwordHash: string;
  role: AppRole;
  disabled?: boolean;
  createdAt: number;
}) {
  const db = getAdminDb();
  await db.transact(
    db.tx.app_users[input.id].update({
      ...input,
      disabled: Boolean(input.disabled),
    }),
  );
}

export async function disableUserById(userId: string) {
  const db = getAdminDb();
  await db.transact(
    db.tx.app_users[userId].update({
      disabled: true,
    }),
  );
}

export async function deleteUserById(userId: string) {
  const db = getAdminDb();
  await db.transact(db.tx.app_users[userId].delete());
}
