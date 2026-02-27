import { threeStopGradient, twoStopGradient } from "@/lib/heatmap";
import type { HeatmapStat, TableRow } from "@/types/domain";
import type { CSSProperties } from "react";

export const VAN_COLUMNS = new Set([
  "runner",
  "name",
  "leg",
  "estimatedPace",
  "estimatedLegTime",
  "actualPace",
  "initialEstimatedStart",
  "updatedEstimatedStart",
  "actualStart",
  "delta",
  "estimatedStint",
  "actualStint"
]);

export function getVanCellStyle(runnerNumber: number, columnKey: string): CSSProperties {
  if (!VAN_COLUMNS.has(columnKey)) {
    return {};
  }

  if (runnerNumber <= 6) {
    return { backgroundColor: "#fff3c4" };
  }
  return { backgroundColor: "#d9f7df" };
}

export function getHeatmapStyle(
  column: "mileage" | "elevGain" | "elevLoss" | "netElevDiff",
  value: number,
  stat: HeatmapStat
): CSSProperties {
  let backgroundColor = "transparent";

  if (column === "mileage") {
    const mid = (stat.min + stat.max) / 2;
    backgroundColor = threeStopGradient(value, stat.min, mid, stat.max, [183, 225, 205], [255, 255, 255], [245, 178, 178]);
  }

  if (column === "elevGain") {
    backgroundColor = twoStopGradient(value, stat.min, stat.max, [255, 255, 255], [245, 178, 178]);
  }

  if (column === "elevLoss") {
    backgroundColor = twoStopGradient(value, stat.min, stat.max, [183, 225, 205], [255, 255, 255]);
  }

  if (column === "netElevDiff") {
    const mid = (stat.min + stat.max) / 2;
    backgroundColor = threeStopGradient(value, stat.min, mid, stat.max, [183, 225, 205], [255, 255, 255], [245, 178, 178]);
  }

  return { backgroundColor };
}

export function getNextLegIndex(rows: TableRow[]): number {
  return rows.findIndex((row) => !row.actualLegStartTime);
}
