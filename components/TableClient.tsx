"use client";

import ImportLegsModal from "@/components/ImportLegsModal";
import PaceEditor from "@/components/PaceEditor";
import RaceDayTimeInput from "@/components/RaceDayTimeInput";
import { getHeatmapStyle, getNextLegIndex, getVanCellStyle } from "@/lib/formatRules";
import {
  formatUTCISOStringToLARaceDayTime,
  formatSecondsToHMS,
  formatSecondsToPace,
  formatUTCISOStringToLA_friendly,
} from "@/lib/time";
import { useMemo, useState } from "react";
import type { TableData, TableRow } from "@/types/domain";

type Props = {
  initialData: TableData;
  isAdmin: boolean;
  canEdit: boolean;
};

export default function TableClient({ initialData, isAdmin, canEdit }: Props) {
  const [data, setData] = useState<TableData>(initialData);
  const [busy, setBusy] = useState(false);
  const [showLegStats, setShowLegStats] = useState(true);

  const nextLegIndex = useMemo(() => getNextLegIndex(data.rows), [data.rows]);

  async function refresh() {
    const res = await fetch("/api/table", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as TableData;
      setData(json);
    }
  }

  function getDisplayedActualStartTime(row: TableRow): string | null {
    if (row.leg === 1) {
      return row.actualLegStartTime ?? data.race_start_time;
    }

    return row.actualLegStartTime;
  }

  async function save(path: string, body: unknown) {
    if (!canEdit) {
      return;
    }
    setBusy(true);
    const ok = await patch(path, body);
    if (ok) {
      await refresh();
    }
    setBusy(false);
  }

  async function patch(path: string, body: unknown): Promise<boolean> {
    if (!canEdit) {
      return false;
    }
    const res = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      return false;
    }

    return true;
  }

  function updateRowLocal(leg: number, patch: Partial<TableRow>) {
    setData((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => (row.leg === leg ? { ...row, ...patch } : row))
    }));
  }

  function updateConfigLocal(patch: Partial<TableData>) {
    setData((prev) => ({ ...prev, ...patch }));
  }

  function updateRunnerDefaultLocal(runnerNumber: number, pace: number | null) {
    setData((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => {
        if (row.runnerNumber !== runnerNumber) {
          return row;
        }
        const isFirstLeg = row.leg === runnerNumber;
        const nextOverride = isFirstLeg ? null : row.estimatedPaceOverrideSpm;
        const nextEstimatedPace = nextOverride ?? pace;
        return {
          ...row,
          runnerDefaultPaceSpm: pace,
          estimatedPaceOverrideSpm: nextOverride,
          estimatedPaceSpm: nextEstimatedPace,
          isOverride: nextOverride !== null && nextOverride !== pace
        };
      })
    }));
  }

  async function saveEstimatedPace(row: TableRow, value: number | null) {
    if (!canEdit) {
      return;
    }
    setBusy(true);

    if (row.leg <= 12) {
      updateRunnerDefaultLocal(row.runnerNumber, value);
      const paceSaved = await patch(`/api/runners/${row.runnerNumber}`, {
        default_estimated_pace_spm: value
      });

      let overrideCleared = true;
      if (row.estimatedPaceOverrideSpm !== null) {
        overrideCleared = await patch(`/api/leg-inputs/${row.leg}`, {
          estimated_pace_override_spm: null
        });
      }

      if (paceSaved && overrideCleared) {
        await refresh();
      }
      setBusy(false);
      return;
    }

    const nextEstimatedPace = value ?? row.runnerDefaultPaceSpm;
    updateRowLocal(row.leg, {
      estimatedPaceSpm: nextEstimatedPace,
      estimatedPaceOverrideSpm: value,
      isOverride: value !== null && value !== row.runnerDefaultPaceSpm
    });
    const saved = await patch(`/api/leg-inputs/${row.leg}`, { estimated_pace_override_spm: value });
    if (saved) {
      await refresh();
    }
    setBusy(false);
  }

  async function resetActualStartTimes() {
    if (!isAdmin || !canEdit || busy) {
      return;
    }

    const confirmed = window.confirm("Clear all Actual Start Time values?");
    if (!confirmed) {
      return;
    }

    setBusy(true);
    const results = await Promise.all(
      data.rows.map((row) =>
        patch(`/api/leg-inputs/${row.leg}`, {
          actual_start_time: null
        })
      )
    );

    if (results.every(Boolean)) {
      setData((prev) => ({
        ...prev,
        rows: prev.rows.map((row) => ({
          ...row,
          actualLegStartTime: null
        }))
      }));
      await refresh();
    }

    setBusy(false);
  }

  const estimatedFinishTime = useMemo(() => {
    const lastLeg = data.rows[data.rows.length - 1];
    if (!lastLeg?.updatedEstimatedStartTime || lastLeg.estimatedPaceSpm === null) {
      return null;
    }

    const estimatedStartTs = new Date(lastLeg.updatedEstimatedStartTime).getTime();
    if (!Number.isFinite(estimatedStartTs)) {
      return null;
    }

    const estimatedDurationSec = Math.round(lastLeg.legMileage * lastLeg.estimatedPaceSpm);
    return new Date(estimatedStartTs + estimatedDurationSec * 1000).toISOString();
  }, [data.rows]);

  const actualStartDefaults = useMemo(() => {
    let day: "fri" | "sat" = "fri";
    let meridiem: "am" | "pm" = "am";

    return data.rows.map((row) => {
      const currentDefault = { day, meridiem };
      const displayedActualStartTime = getDisplayedActualStartTime(row);
      if (displayedActualStartTime) {
        const parsed = formatUTCISOStringToLARaceDayTime(displayedActualStartTime);
        day = parsed.day;
        meridiem = parsed.meridiem;
      }
      return currentDefault;
    });
  }, [data.race_start_time, data.rows]);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {!canEdit ? (
        <section className="panel" style={{ borderColor: "#7b6a1e", backgroundColor: "#fff8dd" }}>
          <strong>Viewer mode:</strong> editing is disabled until you log in.
        </section>
      ) : null}
      <section className="panel" style={{ display: "grid", gap: "0.8rem" }}>
        <h2>Race Timing</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, max-content)", gap: "1rem", justifyContent: "start", alignItems: "end" }}>
          <label style={{ display: "grid", gap: "0.35rem", width: "fit-content" }}>
            <div className="muted">Race Start Time</div>
            <RaceDayTimeInput
              disabled={!canEdit}
              value={data.race_start_time}
              onChange={(iso) => {
                updateConfigLocal({ race_start_time: iso });
              }}
              onCommit={(iso) => {
                void save("/api/config", { race_start_time: iso });
              }}
            />
          </label>

          <div style={{ display: "grid", gap: "0.35rem", width: "fit-content" }}>
            <div className="muted">Estimated Finish Time</div>
            <div
              style={{
                minHeight: 34,
                display: "inline-flex",
                alignItems: "center",
                padding: "0.25rem 0.35rem",
                border: "1px solid #d4dbd4",
                borderRadius: 6,
                background: "#f7faf7"
              }}
            >
              {formatUTCISOStringToLA_friendly(estimatedFinishTime)}
            </div>
          </div>

          <label style={{ display: "grid", gap: "0.35rem", width: "fit-content" }}>
            <div className="muted">Actual Finish Time</div>
            <RaceDayTimeInput
              disabled={!canEdit}
              value={data.finish_time}
              onChange={(iso) => {
                updateConfigLocal({ finish_time: iso });
              }}
              onCommit={(iso) => {
                void save("/api/config", { finish_time: iso });
              }}
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button className="secondary" type="button" onClick={() => setShowLegStats((value) => !value)}>
            {showLegStats ? "Hide" : "Show"} Leg Stats
          </button>
          {isAdmin ? <ImportLegsModal onImported={refresh} /> : null}
          {isAdmin ? (
            <button className="secondary" type="button" onClick={() => void resetActualStartTimes()}>
              Reset Actual Start Times
            </button>
          ) : null}
        </div>
      </section>

      <section className="table-wrap">
        {isAdmin ? <div className="muted" style={{ padding: "0.5rem 0.6rem" }}>Names are edited in the Runners panel (Admin).</div> : null}
        <table>
          <thead>
            <tr>
              <th data-column="A" title="Column A">Runner</th>
              <th data-column="B" title="Column B">Name</th>
              <th data-column="C" title="Column C">Leg</th>
              {showLegStats ? <th data-column="D" title="Column D">Leg Mileage</th> : null}
              {showLegStats ? <th data-column="E" title="Column E">Elev Gain</th> : null}
              {showLegStats ? <th data-column="F" title="Column F">Elev Loss</th> : null}
              {showLegStats ? <th data-column="G" title="Column G">Net Elev Diff</th> : null}
              <th data-column="H" title="Column H">Estimated Pace</th>
              <th data-column="I" title="Column I">Leg Duration at Estimated Pace</th>
              <th data-column="J" title="Column J">Actual Pace</th>
              <th data-column="L" title="Column L">Est. Start Time</th>
              <th data-column="M" title="Column M">Actual Start Time</th>
              <th data-column="N" title="Column N">Delta to Pre-Race Estimates</th>
              <th data-column="O" title="Column O">Est. Van Stint Duration</th>
              <th data-column="Q" title="Column Q" style={{ width: "max-content", minWidth: "max-content" }}>
                Exchange Location
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => {
              const rowClass = idx === nextLegIndex ? "next-leg" : "";
              return (
                <tr key={row.leg} className={rowClass}>
                  <td style={getVanCellStyle(row.runnerNumber, "runner")}>{row.runnerNumber}</td>
                  <td style={getVanCellStyle(row.runnerNumber, "name")}>
                    {row.runnerName}
                  </td>
                  <td style={getVanCellStyle(row.runnerNumber, "leg")}>{row.leg}</td>

                  {showLegStats ? (
                    <td style={getHeatmapStyle("mileage", row.legMileage, data.heatmap.mileage)}>
                      {isAdmin ? (
                        <input
                          type="number"
                          disabled={!canEdit}
                          step="0.01"
                          defaultValue={row.legMileage}
                          onBlur={(event) => {
                            const value = Number(event.target.value);
                            updateRowLocal(row.leg, { legMileage: value });
                            void save(`/api/legs/${row.leg}`, { leg_mileage: value });
                          }}
                        />
                      ) : (
                        row.legMileage.toFixed(2)
                      )}
                    </td>
                  ) : null}

                  {showLegStats ? (
                    <td style={getHeatmapStyle("elevGain", row.elevGainFt, data.heatmap.elevGain)}>
                      {isAdmin ? (
                        <input
                          type="number"
                          disabled={!canEdit}
                          defaultValue={row.elevGainFt}
                          onBlur={(event) => {
                            const value = Number(event.target.value);
                            updateRowLocal(row.leg, { elevGainFt: value });
                            void save(`/api/legs/${row.leg}`, { elev_gain_ft: value });
                          }}
                        />
                      ) : (
                        row.elevGainFt
                      )}
                    </td>
                  ) : null}

                  {showLegStats ? (
                    <td style={getHeatmapStyle("elevLoss", row.elevLossFt, data.heatmap.elevLoss)}>
                      {isAdmin ? (
                        <input
                          type="number"
                          disabled={!canEdit}
                          defaultValue={row.elevLossFt}
                          onBlur={(event) => {
                            const value = Number(event.target.value);
                            updateRowLocal(row.leg, { elevLossFt: value });
                            void save(`/api/legs/${row.leg}`, { elev_loss_ft: value });
                          }}
                        />
                      ) : (
                        row.elevLossFt
                      )}
                    </td>
                  ) : null}

                  {showLegStats ? (
                    <td style={getHeatmapStyle("netElevDiff", row.netElevDiffFt, data.heatmap.netElevDiff)}>
                      {isAdmin ? (
                        <input
                          type="number"
                          disabled={!canEdit}
                          defaultValue={row.netElevDiffFt}
                          onBlur={(event) => {
                            const value = Number(event.target.value);
                            updateRowLocal(row.leg, { netElevDiffFt: value });
                            void save(`/api/legs/${row.leg}`, { net_elev_diff_ft: value });
                          }}
                        />
                      ) : (
                        row.netElevDiffFt
                      )}
                    </td>
                  ) : null}

                  <td style={getVanCellStyle(row.runnerNumber, "estimatedPace")}>
                    <PaceEditor
                      disabled={!canEdit}
                      value={row.leg <= 12 ? row.runnerDefaultPaceSpm : row.estimatedPaceOverrideSpm ?? row.runnerDefaultPaceSpm}
                      onSave={(value) => {
                        void saveEstimatedPace(row, value);
                      }}
                    />
                    <div className="muted">{formatSecondsToPace(row.estimatedPaceSpm)}</div>
                  </td>

                  <td style={getVanCellStyle(row.runnerNumber, "estimatedLegTime")}>
                    {formatSecondsToHMS(row.estimatedPaceSpm !== null ? Math.round(row.legMileage * row.estimatedPaceSpm) : null)}
                  </td>
                  <td style={getVanCellStyle(row.runnerNumber, "actualPace")}>{formatSecondsToPace(row.actualPaceSpm)}</td>
                  <td style={getVanCellStyle(row.runnerNumber, "updatedEstimatedStart")}>{formatUTCISOStringToLA_friendly(row.updatedEstimatedStartTime)}</td>
                  <td style={getVanCellStyle(row.runnerNumber, "actualStart")}>
                    <RaceDayTimeInput
                      disabled={!canEdit}
                      value={getDisplayedActualStartTime(row)}
                      defaultDay={actualStartDefaults[idx]?.day}
                      defaultMeridiem={actualStartDefaults[idx]?.meridiem}
                      onChange={(iso) => {
                        updateRowLocal(row.leg, { actualLegStartTime: iso });
                      }}
                      onCommit={(iso) => {
                        void save(`/api/leg-inputs/${row.leg}`, { actual_start_time: iso });
                      }}
                    />
                  </td>
                  <td style={getVanCellStyle(row.runnerNumber, "delta")}>{formatSecondsToHMS(row.deltaToPreRaceSec)}</td>
                  <td style={getVanCellStyle(row.runnerNumber, "estimatedStint")}>{formatSecondsToHMS(row.estimatedVanStintSec)}</td>
                  <td style={{ width: "max-content", minWidth: "max-content" }}>
                    {isAdmin ? (
                      <div style={{ display: "grid", gap: "0.3rem" }}>
                        <input
                          type="text"
                          disabled={!canEdit}
                          defaultValue={row.exchangeLabel}
                          onBlur={(event) => {
                            const value = event.target.value;
                            updateRowLocal(row.leg, { exchangeLabel: value });
                            void save(`/api/legs/${row.leg}`, { exchange_label: value });
                          }}
                        />
                        <input
                          type="text"
                          disabled={!canEdit}
                          defaultValue={row.exchangeUrl}
                          onBlur={(event) => {
                            const value = event.target.value;
                            updateRowLocal(row.leg, { exchangeUrl: value });
                            void save(`/api/legs/${row.leg}`, { exchange_url: value });
                          }}
                        />
                      </div>
                    ) : (
                      <a href={row.exchangeUrl} target="_blank" rel="noreferrer">
                        {row.exchangeLabel}
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
