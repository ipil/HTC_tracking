import { NextResponse } from "next/server";

function clearCookies(response: NextResponse): NextResponse {
  const isProd = process.env.NODE_ENV === "production";
  const domain = isProd ? "klarquist.run" : undefined;
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isProd,
    ...(domain ? { domain } : {}),
    maxAge: 0
  };

  response.cookies.set("site_auth", "", base);
  response.cookies.set("admin_auth", "", base);
  return response;
}

export async function POST(): Promise<NextResponse> {
  return clearCookies(NextResponse.json({ ok: true }));
}
