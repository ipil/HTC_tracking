import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest): NextResponse {
  try {
    const { pathname } = request.nextUrl;
    const siteCookie = request.cookies.get("site_auth")?.value;
    const adminCookie = request.cookies.get("admin_auth")?.value;

    if (pathname.startsWith("/admin") && !adminCookie) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
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
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.png|apple-touch-icon\\.png|robots\\.txt|sitemap\\.xml|login|admin/login|api/auth).*)"
  ]
};
