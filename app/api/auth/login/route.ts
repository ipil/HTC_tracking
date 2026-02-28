import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/lib/authCookies";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const hostname = request.nextUrl.hostname;

  const expected = process.env.SITE_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "SITE_PASSWORD is not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const password = body?.password;
  if (typeof password !== "string" || password !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  setAuthCookie(response, "site_auth", "1", hostname);
  setAuthCookie(response, "admin_auth", "0", hostname);
  return response;
}
