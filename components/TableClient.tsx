"use client";

import { useEffect, useMemo, useState } from "react";
import ImportLegsModal from "@/components/ImportLegsModal";
import { getHeatmapStyle, getNextLegIndex, getVanCellStyle } from "@/lib/formatRules";
import {
  formatSecondsToHMS,
  formatSecondsToPace,
  formatUTCISOStringToLA_datetimeLocal,
  formatUTCISOStringToLA_friendly,
  parseLA_datetimeLocalToUTCISOString
} from "@/lib/time";
import type { TableData, TableRow } from "@/types/domain";

type Props = {
  initialData: TableData;
  isAdmin: boolean;
  canEdit: boolean;
};

function splitPaceValue(totalSeconds: number | null): { minutes: string; seconds: string } {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) {
    return { minutes: "", seconds: "" };
  }

  const rounded = Math.max(0, Math.round(totalSeconds));
  return {
    minutes: String(Math.floor(rounded / 60)),
    seconds: String(rounded % 60).padStart(2, "0")
  };
}

function combinePaceValue(minutes: string, seconds: string): number | null {
  if (minutes === "" && seconds === "") {
    return null;
  }

  const mins = Number(minutes || "0");
  const secs = Number(seconds || "0");
  if (!Number.isFinite(mins) || !Number.isFinite(secs)) {
    return null;
  }

  return Math.max(0, mins * 60 + Math.min(59, Math.max(0, secs)));
}

type PaceEditorProps = {
  disabled: boolean;
  value: number | null;
  onSave: (value: number | null) => void;
};

function PaceEditor({ disabled, value, onSave }: PaceEditorProps) {
  const initial = splitPaceValue(value);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [seconds, setSeconds] = useState(initial.seconds);

  useEffect(() => {
    const next = splitPaceValue(value);
    setMinutes(next.minutes);
    setSeconds(next.seconds);
  }, [value]);

  function commit() {
    onSave(combinePaceValue(minutes, seconds));
  }

  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", gap: "0.25rem", alignItems: "center" }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          commit();
        }
      }}
    >
      <input
        type="number"
        inputMode="numeric"
        min="0"
        placeholder="MM"
        disabled={disabled}
        value={minutes}
        onChange={(event) => {
          setMinutes(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
      <span className="muted">:</span>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        max="59"
        placeholder="SS"
        disabled={disabled}
        value={seconds}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (nextValue === "") {
            setSeconds("");
            return;
          }
          const parsed = Number(nextValue);
          setSeconds(String(Math.min(59, Math.max(0, parsed))));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

export default function TableClient({ initialData, isAdmin, canEdit }: Props) {
  const [data, setData] = useState<TableData>(initialData);
  const [showInitial, setShowInitial] = useState(false);
  const [busy, setBusy] = useState(false);

  const nextLegIndex = useMemo(() => getNextLegIndex(data.rows), [data.rows]);

  async function refresh() {
    const res = await fetch("/api/table", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as TableData;
      setData(json);
    }
  }

  async function save(path: string, body: unknown) {
    if (!canEdit) {
      return;
    }
    setBusy(true);
    const res = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      setBusy(false);
      return;
    }

    await refresh();
    setBusy(false);
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
        return {
          ...row,
          runnerDefaultPaceSpm: pace
        };
      })
    }));
  }

  const totalElapsedSec = useMemo(() => {
    if (!data.race_start_time || !data.finish_time) {
      return null;
    }
    const a = new Date(data.race_start_time).getTime();
    const b = new Date(data.finish_time).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return null;
    }
    return Math.round((b - a) / 1000);
  }, [data.finish_time, data.race_start_time]);

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      {!canEdit ? (
        <section className="panel" style={{ borderColor: "#7b6a1e", backgroundColor: "#fff8dd" }}>
          <strong>Viewer mode:</strong> editing is disabled until you log in.
        </section>
      ) : null}
      <section className="panel" style={{ display: "grid", gap: "0.8rem" }}>
        <h2>Race Timing</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(220px, 1fr))", gap: "0.7rem" }}>
          <label>
            <div className="muted">Race Start Time</div>
            <input
              type="datetime-local"
              disabled={!canEdit}
              value={formatUTCISOStringToLA_datetimeLocal(data.race_start_time)}
              onChange={(event) => {
                const iso = parseLA_datetimeLocalToUTCISOString(event.target.value);
                updateConfigLocal({ race_start_time: iso });
              }}
              onBlur={(event) => {
                const iso = parseLA_datetimeLocalToUTCISOString(event.target.value);
                void save("/api/config", { race_start_time: iso });
              }}
            />
          </label>

          <label>
            <div className="muted">Finish Time</div>
            <input
              type="datetime-local"
              disabled={!canEdit}
              value={formatUTCISOStringToLA_datetimeLocal(data.finish_time)}
              onChange={(event) => {
                const iso = parseLA_datetimeLocalToUTCISOString(event.target.value);
                updateConfigLocal({ finish_time: iso });
              }}
              onBlur={(event) => {
                const iso = parseLA_datetimeLocalToUTCISOString(event.target.value);
                void save("/api/config", { finish_time: iso });
              }}
            />
          </label>
        </div>
        <div className="muted">Total elapsed: {formatSecondsToHMS(totalElapsedSec)}</div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button className="secondary" onClick={() => setShowInitial((v) => !v)}>
            {showInitial ? "Hide" : "Show"} Column J
          </button>
          {isAdmin ? <ImportLegsModal onImported={refresh} /> : null}
          {busy ? <span className="muted">Saving...</span> : null}
        </div>
      </section>

      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th data-column="A" title="Column A">Runner</th>
              <th data-column="B" title="Column B">Name</th>
              <th data-column="C" title="Column C">Leg</th>
              <th data-column="D" title="Column D">Leg Mileage</th>
              <th data-column="E" title="Column E">Elev Gain</th>
              <th data-column="F" title="Column F">Elev Loss</th>
              <th data-column="G" title="Column G">Net Elev Diff</th>
              <th data-column="H" title="Column H">Estimated Pace</th>
              <th data-column="I" title="Column I">Actual Pace</th>
              {showInitial ? <th data-column="J" title="Column J">Initial Est. Start</th> : null}
              <th data-column="K" title="Column K">Updated Est. Start</th>
              <th data-column="L" title="Column L">Actual Start</th>
              <th data-column="M" title="Column M">Delta vs J</th>
              <th data-column="N" title="Column N">Est. Van Stint</th>
              <th data-column="O" title="Column O">Actual Van Stint</th>
              <th data-column="P" title="Column P">Exchange Location</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => {
              const rowClass = idx === nextLegIndex ? "next-leg" : "";
              return (
                <tr key={row.leg} className={rowClass}>
                  <td style={getVanCellStyle(row.runnerNumber, "runner")}>{row.runnerNumber}</td>
                  <td style={getVanCellStyle(row.runnerNumber, "name")}>
                    {isAdmin ? (
                      <input
                        type="text"
                        disabled={!canEdit}
                        defaultValue={row.runnerName}
                        onBlur={(event) => {
                          const value = event.target.value;
                          updateRowLocal(row.leg, { runnerName: value });
                          void save(`/api/runners/${row.runnerNumber}`, { name: value });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            (event.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                      />
                    ) : (
                      row.runnerName
                    )}
                  </td>
                  <td style={getVanCellStyle(row.runnerNumber, "leg")}>{row.leg}</td>

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

                  <td>
                    <PaceEditor
                      disabled={!canEdit}
                      value={row.estimatedPaceOverrideSpm ?? row.estimatedPaceSpm}
                      onSave={(value) => {
                        updateRowLocal(row.leg, {
                          estimatedPaceSpm: value,
                          estimatedPaceOverrideSpm: value,
                          isOverride: value !== row.runnerDefaultPaceSpm
                        });
                        void save(`/api/leg-inputs/${row.leg}`, { estimated_pace_override_spm: value });
                      }}
                    />
                    <div className="muted">{formatSecondsToPace(row.estimatedPaceSpm)}</div>
                    {row.isOverride ? <div className="muted">override</div> : null}
                    <div>
                      Runner default:
                      <PaceEditor
                        disabled={!canEdit}
                        value={row.runnerDefaultPaceSpm}
                        onSave={(value) => {
                          updateRunnerDefaultLocal(row.runnerNumber, value);
                          void save(`/api/runners/${row.runnerNumber}`, {
                            default_estimated_pace_spm: value
                          });
                        }}
                      />
                    </div>
                  </td>

                  <td style={getVanCellStyle(row.runnerNumber, "actualPace")}>{formatSecondsToPace(row.actualPaceSpm)}</td>
                  {showInitial ? (
                    <td style={getVanCellStyle(row.runnerNumber, "initialEstimatedStart")}>{formatUTCISOStringToLA_friendly(row.initialEstimatedStartTime)}</td>
                  ) : null}
                  <td style={getVanCellStyle(row.runnerNumber, "updatedEstimatedStart")}>{formatUTCISOStringToLA_friendly(row.updatedEstimatedStartTime)}</td>
                  <td>
                    <input
                      type="datetime-local"
                      disabled={!canEdit}
                      value={formatUTCISOStringToLA_datetimeLocal(row.actualLegStartTime)}
                      onChange={(event) => {
                        const iso = parseLA_datetimeLocalToUTCISOString(event.target.value);
                        updateRowLocal(row.leg, { actualLegStartTime: iso });
                      }}
                      onBlur={(event) => {
                        const iso = parseLA_datetimeLocalToUTCISOString(event.target.value);
                        void save(`/api/leg-inputs/${row.leg}`, { actual_start_time: iso });
                      }}
                    />
                  </td>
                  <td style={getVanCellStyle(row.runnerNumber, "delta")}>{formatSecondsToHMS(row.deltaToPreRaceSec)}</td>
                  <td style={getVanCellStyle(row.runnerNumber, "estimatedStint")}>{formatSecondsToHMS(row.estimatedVanStintSec)}</td>
                  <td style={getVanCellStyle(row.runnerNumber, "actualStint")}>{formatSecondsToHMS(row.actualVanStintSec)}</td>
                  <td>
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
