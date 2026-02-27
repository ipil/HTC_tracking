import { sql } from "@/lib/db";
import type { Runner } from "@/types/domain";

export async function getRunnersData(): Promise<Runner[]> {
  const result = await sql<Runner>`
    select runner_number, name, default_estimated_pace_spm
    from runners
    order by runner_number asc
  `;

  return result.rows;
}
