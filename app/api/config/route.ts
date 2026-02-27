import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isSiteAuthenticated } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/http";

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!(await isSiteAuthenticated())) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return badRequest("Invalid body");
  }

  const raceStart =
    typeof body.race_start_time === "string" || body.race_start_time === null
      ? body.race_start_time
      : undefined;
  const finishTime =
    typeof body.finish_time === "string" || body.finish_time === null
      ? body.finish_time
      : undefined;

  if (raceStart === undefined && finishTime === undefined) {
    return badRequest("No valid fields");
  }

  await sql`insert into app_config (id) values (1) on conflict (id) do nothing`;

  const updates: string[] = [];
  const values: Array<string | null> = [];
  if (raceStart !== undefined) {
    values.push(raceStart);
    updates.push(`race_start_time = $${values.length}`);
  }
  if (finishTime !== undefined) {
    values.push(finishTime);
    updates.push(`finish_time = $${values.length}`);
  }
  updates.push("updated_at = now()");

  const query = `update app_config set ${updates.join(", ")} where id = 1`;
  await sql.query(query, values);

  return NextResponse.json({ ok: true });
}
