import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAdminAuthenticated, isSiteAuthenticated } from "@/lib/auth";
import { badRequest, forbidden, unauthorized } from "@/lib/http";

export async function PATCH(
  request: NextRequest,
  context: { params: { runner_number: string } }
): Promise<NextResponse> {
  const siteOk = await isSiteAuthenticated();
  if (!siteOk) {
    return unauthorized();
  }

  const adminOk = await isAdminAuthenticated();
  const params = context.params;
  const runnerNumber = Number(params.runner_number);
  if (!Number.isInteger(runnerNumber) || runnerNumber < 1 || runnerNumber > 12) {
    return badRequest("Invalid runner_number");
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return badRequest("Invalid body");
  }

  const pace = typeof body.default_estimated_pace_spm === "number" || body.default_estimated_pace_spm === null
    ? body.default_estimated_pace_spm
    : undefined;
  const name = typeof body.name === "string" ? body.name.trim() : undefined;

  if (pace === undefined && name === undefined) {
    return badRequest("No valid fields");
  }

  if (name !== undefined && !adminOk) {
    return forbidden();
  }

  const updates: string[] = [];
  const values: Array<string | number | null> = [];

  if (name !== undefined) {
    values.push(name);
    updates.push(`name = $${values.length}`);
  }

  if (pace !== undefined) {
    values.push(pace);
    updates.push(`default_estimated_pace_spm = $${values.length}`);
  }

  updates.push("updated_at = now()");
  values.push(runnerNumber);

  const query = `update runners set ${updates.join(", ")} where runner_number = $${values.length}`;
  await sql.query(query, values);

  return NextResponse.json({ ok: true });
}
