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

  const result = await sql.query<{
    id: number;
    race_start_time: string | null;
    finish_time: string | null;
    updated_at: string;
  }>(
    `
      insert into app_config (id, race_start_time, finish_time)
      values (1, $1, $2)
      on conflict (id) do update
      set race_start_time = case when $3 then excluded.race_start_time else app_config.race_start_time end,
          finish_time = case when $4 then excluded.finish_time else app_config.finish_time end,
          updated_at = now()
      returning id, race_start_time::text, finish_time::text, updated_at::text
    `,
    [raceStart ?? null, finishTime ?? null, raceStart !== undefined, finishTime !== undefined]
  );

  console.info("[api/config] updated app_config id=1");
  return NextResponse.json(result.rows[0]);
}
