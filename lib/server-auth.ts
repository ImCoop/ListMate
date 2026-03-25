import { createHmac, timingSafeEqual } from "crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { SessionUser } from "@/lib/auth-types";

type SessionPayload = SessionUser & {
  exp: number;
};

const SESSION_COOKIE_NAME = "listmate_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function base64urlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64urlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionSecret() {
  const secret = process.env.LISTMATE_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("Missing LISTMATE_SESSION_SECRET (min 32 chars).");
  }

  return secret;
}

function signValue(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function createSessionToken(user: SessionUser) {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const signature = signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function readSessionFromToken(token: string | undefined | null): SessionUser | null {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signValue(encodedPayload);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64urlDecode(encodedPayload)) as SessionPayload;

    if (!payload || typeof payload !== "object") {
      return null;
    }

    if (
      typeof payload.id !== "string" ||
      typeof payload.username !== "string" ||
      (payload.role !== "admin" && payload.role !== "user") ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      id: payload.id,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return readSessionFromToken(token);
}

export async function requireSessionUser() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/login");
  }

  return sessionUser;
}

export async function requireAdminSessionUser() {
  const sessionUser = await requireSessionUser();

  if (sessionUser.role !== "admin") {
    redirect("/");
  }

  return sessionUser;
}

export const sessionCookie = {
  name: SESSION_COOKIE_NAME,
  maxAgeSeconds: SESSION_TTL_SECONDS,
};

function isSecureRequest(request: Request) {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");

  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim() === "https";
  }

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function getSessionCookieOptions(request: Request, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecureRequest(request),
    path: "/",
    maxAge,
  };
}
