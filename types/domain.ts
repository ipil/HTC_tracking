export type Runner = {
  runner_number: number;
  name: string;
  default_estimated_pace_spm: number | null;
};

export type Leg = {
  leg: number;
  runner_number: number;
  leg_mileage: number;
  elev_gain_ft: number;
  elev_loss_ft: number;
  net_elev_diff_ft: number;
  exchange_label: string;
  exchange_url: string;
};

export type LegInput = {
  leg: number;
  estimated_pace_override_spm: number | null;
  actual_start_time: string | null;
};

export type TableRow = {
  leg: number;
  runnerNumber: number;
  runnerName: string;
  runnerDefaultPaceSpm: number | null;
  legMileage: number;
  elevGainFt: number;
  elevLossFt: number;
  netElevDiffFt: number;
  estimatedPaceSpm: number | null;
  estimatedPaceOverrideSpm: number | null;
  actualPaceSpm: number | null;
  initialEstimatedStartTime: string | null;
  updatedEstimatedStartTime: string | null;
  actualLegStartTime: string | null;
  deltaToPreRaceSec: number | null;
  estimatedVanStintSec: number | null;
  actualVanStintSec: number | null;
  exchangeLabel: string;
  exchangeUrl: string;
  isOverride: boolean;
};

export type HeatmapStat = {
  min: number;
  max: number;
};

export type TableData = {
  rows: TableRow[];
  race_start_time: string | null;
  finish_time: string | null;
  heatmap: {
    mileage: HeatmapStat;
    elevGain: HeatmapStat;
    elevLoss: HeatmapStat;
    netElevDiff: HeatmapStat;
  };
};
