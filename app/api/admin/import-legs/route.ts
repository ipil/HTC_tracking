import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { badRequest } from "@/lib/http";

type ImportRow = {
  leg: number;
  leg_mileage: number;
  elev_gain_ft: number;
  elev_loss_ft: number;
  net_elev_diff_ft: number;
  exchange_label: string;
  exchange_url: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const admin = (await cookies()).get("admin_auth")?.value;
  if (admin !== "1") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray(body.rows)) {
    return badRequest("Invalid body");
  }

  let updated = 0;

  for (const row of body.rows as ImportRow[]) {
    if (
      !row ||
      typeof row.leg !== "number" ||
      typeof row.leg_mileage !== "number" ||
      typeof row.elev_gain_ft !== "number" ||
      typeof row.elev_loss_ft !== "number" ||
      typeof row.net_elev_diff_ft !== "number" ||
      typeof row.exchange_label !== "string" ||
      typeof row.exchange_url !== "string"
    ) {
      return badRequest("Invalid row payload");
    }

    await sql.query(
      `
        update legs
        set leg_mileage = $2,
            elev_gain_ft = $3,
            elev_loss_ft = $4,
            net_elev_diff_ft = $5,
            exchange_label = $6,
            exchange_url = $7,
            updated_at = now()
        where leg = $1
      `,
      [
        row.leg,
        row.leg_mileage,
        row.elev_gain_ft,
        row.elev_loss_ft,
        row.net_elev_diff_ft,
        row.exchange_label,
        row.exchange_url
      ]
    );
    updated += 1;
  }

  console.info(`[api/admin/import-legs] updated rows=${updated}`);
  return NextResponse.json({ ok: true, updated });
}
