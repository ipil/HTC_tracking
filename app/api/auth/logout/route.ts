import { NextResponse } from "next/server";

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

function clearCookies(response: NextResponse): NextResponse {
  const isProd = process.env.NODE_ENV === "production";
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isProd,
    maxAge: 60 * 60 * 24 * 30
  };

  setCookieEverywhere(response, "site_auth", "0", base, isProd);
  setCookieEverywhere(response, "admin_auth", "0", base, isProd);
  return response;
}

export async function POST(): Promise<NextResponse> {
  return clearCookies(NextResponse.json({ ok: true }));
}
