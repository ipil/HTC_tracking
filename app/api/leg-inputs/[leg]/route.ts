import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isSiteAuthenticated } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/http";
import { normalizeUTCISOString } from "@/lib/time";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/leg-inputs/[leg]">
): Promise<NextResponse> {
  if (!(await isSiteAuthenticated())) {
    return unauthorized();
  }

  const { leg: legParam } = await ctx.params;
  const leg = Number(legParam);
  if (!Number.isInteger(leg) || leg < 1 || leg > 36) {
    return badRequest("Invalid leg");
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return badRequest("Invalid body");
  }

  const paceOverride = typeof body.estimated_pace_override_spm === "number" || body.estimated_pace_override_spm === null
    ? body.estimated_pace_override_spm
    : undefined;

  const actualStart = typeof body.actual_start_time === "string" || body.actual_start_time === null
    ? body.actual_start_time
    : undefined;

  if (paceOverride === undefined && actualStart === undefined) {
    return badRequest("No valid fields");
  }

  const updates: string[] = [];
  const values: Array<string | number | null> = [];

  if (paceOverride !== undefined) {
    values.push(paceOverride);
    updates.push(`estimated_pace_override_spm = $${values.length}`);
  }

  if (actualStart !== undefined) {
    values.push(actualStart);
    updates.push(`actual_start_time = $${values.length}`);
  }

  updates.push("updated_at = now()");
  values.push(leg);
  const query = `update leg_inputs set ${updates.join(", ")} where leg = $${values.length} returning leg, estimated_pace_override_spm, actual_start_time, updated_at`;
  const result = await sql.query<{
    leg: number;
    estimated_pace_override_spm: number | null;
    actual_start_time: unknown;
    updated_at: unknown;
  }>(query, values);
  console.info(`[api/leg-inputs] updated leg=${leg}`);

  const row = result.rows[0];
  return NextResponse.json({
    leg: row.leg,
    estimated_pace_override_spm: row.estimated_pace_override_spm,
    actual_start_time: normalizeUTCISOString(row.actual_start_time),
    updated_at: normalizeUTCISOString(row.updated_at)
  });
}
