import { NextRequest, NextResponse } from "next/server";

function clearCookies(response: NextResponse): NextResponse {
  response.cookies.set("site_auth", "", { path: "/", maxAge: 0 });
  response.cookies.set("admin_auth", "", { path: "/", maxAge: 0 });
  return response;
}

export async function POST(): Promise<NextResponse> {
  return clearCookies(NextResponse.json({ ok: true }));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return clearCookies(NextResponse.redirect(new URL("/login", request.url)));
}
