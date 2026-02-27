import { NextResponse } from "next/server";
import { isSiteAuthenticated } from "@/lib/auth";
import { getTableData } from "@/lib/tableData";
import { unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  if (!(await isSiteAuthenticated())) {
    return unauthorized();
  }
  const data = await getTableData();
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
