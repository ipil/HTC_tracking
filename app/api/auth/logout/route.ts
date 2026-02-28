import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/lib/authCookies";

function clearCookies(response: NextResponse, hostname?: string): NextResponse {
  setAuthCookie(response, "site_auth", "0", hostname);
  setAuthCookie(response, "admin_auth", "0", hostname);
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return clearCookies(NextResponse.json({ ok: true }), request.nextUrl.hostname);
}
