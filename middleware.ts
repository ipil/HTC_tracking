import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest): NextResponse {
  try {
    const { pathname } = request.nextUrl;
    const siteCookie = request.cookies.get("site_auth")?.value;
    const adminCookie = request.cookies.get("admin_auth")?.value;
    const isAdminPage = pathname.startsWith("/admin");
    const isAdminApi = pathname.startsWith("/api/admin");
    const isAdminLogin = pathname === "/admin/login";
    const isTeamLogin = pathname === "/login";
    const isAuthApi =
      pathname === "/api/auth/admin-login" ||
      pathname === "/api/auth/login" ||
      pathname === "/api/auth/logout";

    if (isAdminLogin || isTeamLogin || isAuthApi) {
      return NextResponse.next();
    }

    if (isAdminPage || isAdminApi) {
      if (!adminCookie) {
        if (isAdminApi) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/admin/login", request.url));
      }
      return NextResponse.next();
    }

    if (!siteCookie) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
  } catch (error) {
    console.error("middleware error", error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|apple-touch-icon\\.png|robots\\.txt|sitemap\\.xml).*)"
  ]
};
