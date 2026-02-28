import "server-only";

import type { NextResponse } from "next/server";

type CookieBase = {
  httpOnly: boolean;
  sameSite: "lax";
  path: string;
  secure: boolean;
  maxAge: number;
};

export function getAuthCookieBase(): CookieBase {
  const isProd = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProd,
    maxAge: 60 * 60 * 24 * 30
  };
}

function shouldUseKlarquistDomain(hostname?: string): boolean {
  return Boolean(
    process.env.NODE_ENV === "production" &&
      hostname &&
      (hostname === "klarquist.run" ||
        hostname === "www.klarquist.run" ||
        hostname.endsWith(".klarquist.run"))
  );
}

export function setAuthCookie(
  response: NextResponse,
  name: "site_auth" | "admin_auth",
  value: string,
  hostname?: string
): void {
  const base = getAuthCookieBase();
  response.cookies.set(name, value, base);

  if (shouldUseKlarquistDomain(hostname)) {
    response.cookies.set(name, value, {
      ...base,
      domain: "klarquist.run"
    });
  }
}

