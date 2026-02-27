import { NextRequest, NextResponse } from "next/server";
import { verifyCookieValue } from "@/lib/cookies";

function isApi(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function unauthorizedResponse(pathname: string, request: NextRequest): NextResponse {
  if (isApi(pathname)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next();
  }

  const allowlisted = new Set([
    "/login",
    "/admin/login",
    "/api/auth/login",
    "/api/auth/admin-login",
    "/api/auth/logout"
  ]);

  const siteProtected = Boolean(process.env.SITE_PASSWORD);
  const adminProtected = Boolean(process.env.ADMIN_PASSWORD);

  if (siteProtected && !allowlisted.has(pathname)) {
    const siteCookie = request.cookies.get("site_auth")?.value;
    if (!verifyCookieValue(siteCookie, "1")) {
      return unauthorizedResponse(pathname, request);
    }
  }

  const adminOnlyPath = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const adminApiPath = pathname.startsWith("/api/legs");

  if (adminProtected && (adminOnlyPath || adminApiPath)) {
    const adminCookie = request.cookies.get("admin_auth")?.value;
    if (!verifyCookieValue(adminCookie, "1")) {
      if (isApi(pathname)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"]
};
