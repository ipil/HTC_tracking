import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isSiteAuthenticated } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/http";

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
  const query = `update leg_inputs set ${updates.join(", ")} where leg = $${values.length}`;
  await sql.query(query, values);

  return NextResponse.json({ ok: true });
}
