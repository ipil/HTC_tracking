import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { normalizeUTCISOString } from "@/lib/time";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/runners/[runner_number]">
): Promise<NextResponse> {
  const siteAuth = request.cookies.get("site_auth")?.value;
  const adminAuth = request.cookies.get("admin_auth")?.value;

  if (siteAuth !== "1" && adminAuth !== "1") {
    return unauthorized();
  }

  const { runner_number } = await ctx.params;
  const runnerNumber = Number(runner_number);
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

  if (name !== undefined && adminAuth !== "1") {
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

  const query = `update runners set ${updates.join(", ")} where runner_number = $${values.length} returning runner_number, name, default_estimated_pace_spm, updated_at::text`;
  const result = await sql.query<{
    runner_number: number;
    name: string | null;
    default_estimated_pace_spm: number | null;
    updated_at: unknown;
  }>(query, values);

  console.info(`[api/runners] updated runner_number=${runnerNumber}`);
  const row = result.rows[0];
  return NextResponse.json({
    runner_number: row.runner_number,
    name: row.name ?? "",
    default_estimated_pace_spm: row.default_estimated_pace_spm,
    updated_at: normalizeUTCISOString(row.updated_at)
  });
}
