import { NextResponse } from "next/server";

import { getSessionCookieOptions, sessionCookie } from "@/lib/server-auth";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });

  response.cookies.set(sessionCookie.name, "", getSessionCookieOptions(request, 0));

  return response;
}
