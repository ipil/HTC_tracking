import { NextRequest, NextResponse } from "next/server";
import { signCookieValue } from "@/lib/cookies";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ ok: true });
  }

  const body = await request.json().catch(() => null);
  const password = body?.password;
  if (typeof password !== "string" || password !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("admin_auth", signCookieValue("1"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });
  return response;
}
