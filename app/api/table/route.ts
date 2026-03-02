import { NextResponse } from "next/server";
import { isSiteAuthenticated } from "@/lib/auth";
import { getTableData } from "@/lib/tableData";
import { unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  if (!(await isSiteAuthenticated())) {
    return unauthorized();
  }
  const data = await getTableData();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store"
    }
  });
}
