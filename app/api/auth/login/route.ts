import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const isProd = process.env.NODE_ENV === "production";
  const cookieBase = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isProd,
    maxAge: 60 * 60 * 24 * 30
  };
  const domain = isProd ? "klarquist.run" : undefined;

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
  response.cookies.set("site_auth", "1", {
    ...cookieBase,
    ...(domain ? { domain } : {})
  });
  return response;
}
