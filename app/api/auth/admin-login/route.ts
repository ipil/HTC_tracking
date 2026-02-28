import { NextRequest, NextResponse } from "next/server";

function setCookieEverywhere(
  response: NextResponse,
  name: string,
  value: string,
  base: {
    httpOnly: boolean;
    sameSite: "lax";
    path: string;
    secure: boolean;
    maxAge: number;
  },
  isProd: boolean
) {
  response.cookies.set(name, value, base);
  if (isProd) {
    response.cookies.set(name, value, {
      ...base,
      domain: "klarquist.run"
    });
    response.cookies.set(name, value, {
      ...base,
      domain: "www.klarquist.run"
    });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const isProd = process.env.NODE_ENV === "production";
  const cookieBase = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isProd,
    maxAge: 60 * 60 * 24 * 30
  };

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "ADMIN_PASSWORD is not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const password = body?.password;
  if (typeof password !== "string" || password !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  setCookieEverywhere(response, "site_auth", "1", cookieBase, isProd);
  setCookieEverywhere(response, "admin_auth", "1", cookieBase, isProd);
  return response;
}
