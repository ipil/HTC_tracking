import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isAdminAuthenticated, isSiteAuthenticated } from "@/lib/auth";
import { badRequest, forbidden, unauthorized } from "@/lib/http";

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/legs/[leg]">
): Promise<NextResponse> {
  if (!(await isSiteAuthenticated())) {
    return unauthorized();
  }

  if (!(await isAdminAuthenticated())) {
    return forbidden();
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

  const updates: string[] = [];
  const values: Array<string | number> = [];

  function addUpdate(sqlField: string, value: string | number): void {
    values.push(value);
    updates.push(`${sqlField} = $${values.length}`);
  }

  if (typeof body.leg_mileage === "number") addUpdate("leg_mileage", body.leg_mileage);
  if (typeof body.elev_gain_ft === "number") addUpdate("elev_gain_ft", body.elev_gain_ft);
  if (typeof body.elev_loss_ft === "number") addUpdate("elev_loss_ft", body.elev_loss_ft);
  if (typeof body.net_elev_diff_ft === "number") addUpdate("net_elev_diff_ft", body.net_elev_diff_ft);
  if (typeof body.exchange_label === "string") addUpdate("exchange_label", body.exchange_label.trim());
  if (typeof body.exchange_url === "string") addUpdate("exchange_url", body.exchange_url.trim());

  if (updates.length === 0) {
    return badRequest("No valid fields");
  }

  values.push(leg);
  const updateSql = `update legs set ${updates.join(", ")}, updated_at = now() where leg = $${values.length}`;
  await sql.query(updateSql, values);

  return NextResponse.json({ ok: true });
}
