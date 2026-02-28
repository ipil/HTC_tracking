import { NextResponse } from "next/server";

function clearCookies(response: NextResponse): NextResponse {
  const isProd = process.env.NODE_ENV === "production";
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: isProd,
    maxAge: 0,
    expires: new Date(0)
  };

  response.cookies.set("site_auth", "", base);
  response.cookies.set("admin_auth", "", base);
  if (isProd) {
    response.cookies.set("site_auth", "", {
      ...base,
      domain: "klarquist.run"
    });
    response.cookies.set("admin_auth", "", {
      ...base,
      domain: "klarquist.run"
    });
    response.cookies.set("site_auth", "", {
      ...base,
      domain: "www.klarquist.run"
    });
    response.cookies.set("admin_auth", "", {
      ...base,
      domain: "www.klarquist.run"
    });
  }
  return response;
}

export async function POST(): Promise<NextResponse> {
  return clearCookies(NextResponse.json({ ok: true }));
}
