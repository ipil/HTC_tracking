import { sql } from "@/lib/db";
import {
  computeActualDurations,
  computeInitialEstimates,
  computeUpdatedEstimates,
  computeVanStints
} from "@/lib/relayMath";
import type { TableData, TableRow } from "@/types/domain";

type JoinedRow = {
  leg: number;
  runner_number: number;
  name: string;
  default_estimated_pace_spm: number | null;
  leg_mileage: string;
  elev_gain_ft: number;
  elev_loss_ft: number;
  net_elev_diff_ft: number;
  exchange_label: string;
  exchange_url: string;
  estimated_pace_override_spm: number | null;
  actual_start_time: string | null;
};

function minMax(values: number[]): { min: number; max: number } {
  if (values.length === 0) {
    return { min: 0, max: 0 };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values)
  };
}

export async function getTableData(): Promise<TableData> {
  const configResult = await sql<{
    race_start_time: string | null;
    finish_time: string | null;
  }>`
    select race_start_time::text, finish_time::text
    from app_config
    where id = 1
  `;

  const configRow = configResult.rows[0] ?? { race_start_time: null, finish_time: null };

  const result = await sql<JoinedRow>`
    select
      l.leg,
      l.runner_number,
      r.name,
      r.default_estimated_pace_spm,
      l.leg_mileage::text,
      l.elev_gain_ft,
      l.elev_loss_ft,
      l.net_elev_diff_ft,
      l.exchange_label,
      l.exchange_url,
      li.estimated_pace_override_spm,
      li.actual_start_time::text
    from legs l
    join runners r on r.runner_number = l.runner_number
    left join leg_inputs li on li.leg = l.leg
    order by l.leg asc
  `;

  const sorted = result.rows;

  const estimatedDurations = sorted.map((row) => {
    const pace = row.estimated_pace_override_spm ?? row.default_estimated_pace_spm;
    if (!pace) {
      return null;
    }
    const mileage = Number(row.leg_mileage);
    return Math.round(mileage * pace);
  });

  const actualStarts = sorted.map((row) => row.actual_start_time);
  const initial = computeInitialEstimates(configRow.race_start_time, estimatedDurations);
  const updated = computeUpdatedEstimates(initial, actualStarts, estimatedDurations);
  const actualDurations = computeActualDurations(actualStarts, configRow.finish_time);
  const stints = computeVanStints(estimatedDurations, actualDurations);

  const rows: TableRow[] = sorted.map((row, idx) => {
    const mileage = Number(row.leg_mileage);
    const actualDuration = actualDurations[idx];
    const actualPaceSpm = actualDuration !== null && mileage > 0 ? actualDuration / mileage : null;

    let deltaToPreRaceSec: number | null = null;
    if (row.actual_start_time && initial[idx]) {
      const actualTs = new Date(row.actual_start_time).getTime();
      const initialTs = new Date(initial[idx] ?? "").getTime();
      if (Number.isFinite(actualTs) && Number.isFinite(initialTs)) {
        deltaToPreRaceSec = Math.round((actualTs - initialTs) / 1000);
      }
    }

    return {
      leg: row.leg,
      runnerNumber: row.runner_number,
      runnerName: row.name,
      runnerDefaultPaceSpm: row.default_estimated_pace_spm,
      legMileage: mileage,
      elevGainFt: row.elev_gain_ft,
      elevLossFt: row.elev_loss_ft,
      netElevDiffFt: row.net_elev_diff_ft,
      estimatedPaceSpm: row.estimated_pace_override_spm ?? row.default_estimated_pace_spm,
      estimatedPaceOverrideSpm: row.estimated_pace_override_spm,
      actualPaceSpm,
      initialEstimatedStartTime: initial[idx],
      updatedEstimatedStartTime: updated[idx],
      actualLegStartTime: row.actual_start_time,
      deltaToPreRaceSec,
      estimatedVanStintSec: stints.estimated[idx],
      actualVanStintSec: stints.actual[idx],
      exchangeLabel: row.exchange_label,
      exchangeUrl: row.exchange_url,
      isOverride:
        row.estimated_pace_override_spm !== null &&
        row.default_estimated_pace_spm !== null &&
        row.estimated_pace_override_spm !== row.default_estimated_pace_spm
    };
  });

  return {
    rows,
    race_start_time: configRow.race_start_time,
    finish_time: configRow.finish_time,
    heatmap: {
      mileage: minMax(rows.map((r) => r.legMileage)),
      elevGain: minMax(rows.map((r) => r.elevGainFt)),
      elevLoss: minMax(rows.map((r) => r.elevLossFt)),
      netElevDiff: minMax(rows.map((r) => r.netElevDiffFt))
    }
  };
}
