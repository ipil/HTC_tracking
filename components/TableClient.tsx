"use client";

import ImportLegsModal from "@/components/ImportLegsModal";
import PaceEditor from "@/components/PaceEditor";
import RaceDayTimeInput from "@/components/RaceDayTimeInput";
import { getHeatmapStyle, getNextLegIndex, getVanCellStyle } from "@/lib/formatRules";
import {
  computeActualDurations,
  computeInitialEstimates,
  computeUpdatedEstimates,
  computeVanStints,
} from "@/lib/relayMath";
import {
  formatUTCISOStringToLARaceDayTime,
  formatSecondsToHMS,
  formatSecondsToPace,
  formatUTCISOStringToLA_friendly,
} from "@/lib/time";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TableData, TableRow } from "@/types/domain";

type Props = {
  initialData: TableData;
  isAdmin: boolean;
  canEdit: boolean;
};

type OfflineOp = {
  path: string;
  body: unknown;
  timestamp: number;
};

const OFFLINE_OPS_KEY = "htc-offline-ops";
const TABLE_CACHE_KEY = "htc-table-cache";

function minMax(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Recompute all derived fields client-side using the same math as getTableData().
 * This is what enables “Google Sheets-like” cascading updates while offline.
 */
function recomputeDerived(input: TableData): TableData {
  const rows = input.rows;

  const estimatedDurations = rows.map((r) => {
    const effectivePace = r.estimatedPaceOverrideSpm ?? r.runnerDefaultPaceSpm;
    if (!effectivePace) return null;
    return Math.round(r.legMileage * effectivePace);
  });

  const actualStarts = rows.map((r, idx) => {
    if (idx === 0) {
      return r.actualLegStartTime ?? input.race_start_time;
    }
    return r.actualLegStartTime;
  });

  const initial = computeInitialEstimates(input.race_start_time, estimatedDurations);
  const updated = computeUpdatedEstimates(initial, actualStarts, estimatedDurations);
  const actualDurations = computeActualDurations(actualStarts, input.finish_time);
  const stints = computeVanStints(estimatedDurations, actualDurations);

  const nextRows: TableRow[] = rows.map((r, idx) => {
    const mileage = r.legMileage;
    const effectiveActualStartTime = actualStarts[idx];

    const actualDuration = actualDurations[idx];
    const actualPaceSpm = actualDuration !== null && mileage > 0 ? actualDuration / mileage : null;

    let deltaToPreRaceSec: number | null = null;
    if (effectiveActualStartTime && initial[idx]) {
      const actualTs = new Date(effectiveActualStartTime).getTime();
      const initialTs = new Date(initial[idx] ?? "").getTime();
      if (Number.isFinite(actualTs) && Number.isFinite(initialTs)) {
        deltaToPreRaceSec = Math.round((actualTs - initialTs) / 1000);
      }
    }

    const effectiveEstimatedPace = r.estimatedPaceOverrideSpm ?? r.runnerDefaultPaceSpm;

    const isOverride =
      r.estimatedPaceOverrideSpm !== null &&
      r.runnerDefaultPaceSpm !== null &&
      r.estimatedPaceOverrideSpm !== r.runnerDefaultPaceSpm;

    return {
      ...r,
      estimatedPaceSpm: effectiveEstimatedPace,
      initialEstimatedStartTime: initial[idx],
      updatedEstimatedStartTime: updated[idx],
      actualLegStartTime: effectiveActualStartTime,
      actualPaceSpm,
      deltaToPreRaceSec,
      estimatedVanStintSec: stints.estimated[idx],
      actualVanStintSec: stints.actual[idx],
      isOverride,
    };
  });

  return {
    ...input,
    rows: nextRows,
    heatmap: {
      mileage: minMax(nextRows.map((r) => r.legMileage)),
      elevGain: minMax(nextRows.map((r) => r.elevGainFt)),
      elevLoss: minMax(nextRows.map((r) => r.elevLossFt)),
      netElevDiff: minMax(nextRows.map((r) => r.netElevDiffFt)),
    },
  };
}

export default function TableClient({ initialData, isAdmin, canEdit }: Props) {
  const [data, setData] = useState<TableData>(() => recomputeDerived(initialData));
  const [busy, setBusy] = useState(false);
  const [showLegStats, setShowLegStats] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [pendingOfflineEdits, setPendingOfflineEdits] = useState(0);

  // Keep a ref of the latest data so we can flush it during pagehide/visibilitychange.
  const dataRef = useRef<TableData>(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  function cacheTable(next: TableData) {
    try {
      localStorage.setItem(TABLE_CACHE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }

  function setDataAndCache(next: TableData) {
    dataRef.current = next;
    setData(next);
    cacheTable(next); // write-through so we don't lose "last edit" on fast refresh
  }

  // Load pending ops count on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OFFLINE_OPS_KEY);
      if (!raw) {
        setPendingOfflineEdits(0);
        return;
      }
      const ops = JSON.parse(raw);
      setPendingOfflineEdits(Array.isArray(ops) ? ops.length : 0);
    } catch {
      setPendingOfflineEdits(0);
    }
  }, []);

  // Load cached table data ONLY when offline (so we don't overwrite fresh server data)
  useEffect(() => {
    if (navigator.onLine) {
      return;
    }

    try {
      const cached = localStorage.getItem(TABLE_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as TableData;
        setDataAndCache(recomputeDerived(parsed));
      }
    } catch {
      // ignore cache errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Extra safety: flush cache when tab/app is backgrounded or navigated away (mobile Safari especially)
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(TABLE_CACHE_KEY, JSON.stringify(dataRef.current));
      } catch {
        // ignore
      }
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Track offline/online state
  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);

    update(); // initial value on mount
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (busy || pendingOfflineEdits > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy, pendingOfflineEdits]);

  const nextLegIndex = useMemo(() => getNextLegIndex(data.rows), [data.rows]);

  async function refresh() {
    const res = await fetch("/api/table", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as TableData;
      setDataAndCache(recomputeDerived(json));
    }
  }

  function getDisplayedActualStartTime(row: TableRow): string | null {
    if (row.leg === 1) {
      return row.actualLegStartTime ?? data.race_start_time;
    }
    return row.actualLegStartTime;
  }

  async function patch(path: string, body: unknown): Promise<boolean> {
    if (!canEdit) return false;

    const res = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return res.ok;
  }

  function readOfflineOps(): OfflineOp[] {
    try {
      const raw = localStorage.getItem(OFFLINE_OPS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as OfflineOp[]) : [];
    } catch {
      return [];
    }
  }

  function writeOfflineOps(ops: OfflineOp[]) {
    try {
      localStorage.setItem(OFFLINE_OPS_KEY, JSON.stringify(ops));
      setPendingOfflineEdits(ops.length);
    } catch {
      // ignore storage errors
    }
  }

  function queueOfflineOp(path: string, body: unknown) {
    const ops = readOfflineOps();
    ops.push({ path, body, timestamp: Date.now() });
    writeOfflineOps(ops);
  }

  async function save(path: string, body: unknown) {
    if (!canEdit) return;

    // OFFLINE → queue locally (no refresh)
    if (isOffline) {
      queueOfflineOp(path, body);
      return;
    }

    // ONLINE → patch + refresh once
    setBusy(true);
    const ok = await patch(path, body);
    if (ok) {
      await refresh();
    }
    setBusy(false);
  }

  // When back online, replay queued offline edits
  useEffect(() => {
    if (isOffline) return;

    (async () => {
      const ops = readOfflineOps();
      if (ops.length === 0) {
        setPendingOfflineEdits(0);
        return;
      }

      setBusy(true);
      try {
        const failed: OfflineOp[] = [];

        for (const op of ops) {
          const ok = await patch(op.path, op.body);
          if (!ok) failed.push(op);
        }

        if (failed.length === 0) {
          try {
            localStorage.removeItem(OFFLINE_OPS_KEY);
          } catch {
            // ignore
          }
          setPendingOfflineEdits(0);
        } else {
          writeOfflineOps(failed);
        }

        await refresh();
      } catch {
        // do not erase queue on error
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline]);

  function updateRowLocal(leg: number, patchObj: Partial<TableRow>) {
    const next = recomputeDerived({
      ...dataRef.current,
      rows: dataRef.current.rows.map((row) => (row.leg === leg ? { ...row, ...patchObj } : row)),
    });
    setDataAndCache(next);
  }

  function updateConfigLocal(patchObj: Partial<TableData>) {
    const next = recomputeDerived({ ...dataRef.current, ...patchObj });
    setDataAndCache(next);
  }

  function updateRunnerDefaultLocal(runnerNumber: number, pace: number | null) {
    const next = recomputeDerived({
      ...dataRef.current,
      rows: dataRef.current.rows.map((row) => {
        if (row.runnerNumber !== runnerNumber) return row;

        const isFirstLeg = row.leg === runnerNumber;
        const nextOverride = isFirstLeg ? null : row.estimatedPaceOverrideSpm;

        return {
          ...row,
          runnerDefaultPaceSpm: pace,
          estimatedPaceOverrideSpm: nextOverride,
        };
      }),
    });
    setDataAndCache(next);
  }

  async function saveEstimatedPace(row: TableRow, value: number | null) {
    if (!canEdit) return;

    setBusy(true);

    // OFFLINE: update UI + queue ops, no refresh
    if (isOffline) {
      if (row.leg <= 12) {
        updateRunnerDefaultLocal(row.runnerNumber, value);

        queueOfflineOp(`/api/runners/${row.runnerNumber}`, {
          default_estimated_pace_spm: value,
        });

        if (row.estimatedPaceOverrideSpm !== null) {
          queueOfflineOp(`/api/leg-inputs/${row.leg}`, {
            estimated_pace_override_spm: null,
          });
        }

        setBusy(false);
        return;
      }

      updateRowLocal(row.leg, {
        estimatedPaceOverrideSpm: value,
      });

      queueOfflineOp(`/api/leg-inputs/${row.leg}`, { estimated_pace_override_spm: value });

      setBusy(false);
      return;
    }

    // ONLINE: patch without per-call refresh, then refresh once
    try {
      if (row.leg <= 12) {
        updateRunnerDefaultLocal(row.runnerNumber, value);

        await patch(`/api/runners/${row.runnerNumber}`, {
          default_estimated_pace_spm: value,
        });

        if (row.estimatedPaceOverrideSpm !== null) {
          await patch(`/api/leg-inputs/${row.leg}`, {
            estimated_pace_override_spm: null,
          });
        }

        await refresh();
        setBusy(false);
        return;
      }

      updateRowLocal(row.leg, {
        estimatedPaceOverrideSpm: value,
      });

      await patch(`/api/leg-inputs/${row.leg}`, { estimated_pace_override_spm: value });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function resetActualStartTimes() {
    if (!isAdmin || !canEdit || busy) return;

    const confirmed = window.confirm("Clear all Actual Start Time values?");
    if (!confirmed) return;

    setBusy(true);

    // OFFLINE: queue all ops in one shot
    if (isOffline) {
      try {
        const ops = readOfflineOps();
        const now = Date.now();
        for (const r of dataRef.current.rows) {
          ops.push({
            path: `/api/leg-inputs/${r.leg}`,
            body: { actual_start_time: null },
            timestamp: now,
          });
        }
        writeOfflineOps(ops);
      } catch {
        // ignore
      }

      // Clear locally right away (and recompute)
      const next = recomputeDerived({
        ...dataRef.current,
        rows: dataRef.current.rows.map((r) => ({ ...r, actualLegStartTime: null })),
      });
      setDataAndCache(next);

      setBusy(false);
      return;
    }

    // ONLINE: patch everything, then refresh once
    await Promise.all(
      dataRef.current.rows.map((r) => patch(`/api/leg-inputs/${r.leg}`, { actual_start_time: null }))
    );

    const next = recomputeDerived({
      ...dataRef.current,
      rows: dataRef.current.rows.map((r) => ({ ...r, actualLegStartTime: null })),
    });
    setDataAndCache(next);

    await refresh();
    setBusy(false);
  }

  const estimatedFinishTime = useMemo(() => {
    const lastLeg = data.rows[data.rows.length - 1];
    if (!lastLeg?.updatedEstimatedStartTime || lastLeg.estimatedPaceSpm === null) return null;

    const estimatedStartTs = new Date(lastLeg.updatedEstimatedStartTime).getTime();
    if (!Number.isFinite(estimatedStartTs)) return null;

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
      {isOffline || pendingOfflineEdits > 0 ? (
        <section
          className="panel"
          style={{
            background: "#fff3cd",
            borderColor: "#d6b94c",
            fontWeight: 600,
          }}
        >
          {isOffline
            ? `OFFLINE MODE — ${pendingOfflineEdits} pending edit${pendingOfflineEdits === 1 ? "" : "s"} will sync when connection returns.`
            : busy
              ? `SYNCING… applying ${pendingOfflineEdits} pending edit${pendingOfflineEdits === 1 ? "" : "s"}`
              : `Pending edits: ${pendingOfflineEdits}`}
        </section>
      ) : null}

      {!canEdit ? (
        <section className="panel" style={{ borderColor: "#7b6a1e", backgroundColor: "#fff8dd" }}>
          <strong>Viewer mode:</strong> editing is disabled until you log in.
        </section>
      ) : null}

      <section className="panel" style={{ display: "grid", gap: "0.8rem" }}>
        <h2>Race Timing</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "max-content",
            gap: "0.85rem",
            justifyContent: "start",
            alignItems: "start",
          }}
        >
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
                background: "#f7faf7",
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
        {isAdmin ? (
          <div className="muted" style={{ padding: "0.5rem 0.6rem" }}>
            Names are edited in the Runners panel (Admin).
          </div>
        ) : null}
        <div className="sheet-scroll">
          <table>
            <thead>
              <tr>
              <th data-column="A" title="Column A">
                Runner
              </th>
              <th data-column="B" title="Column B">
                Name
              </th>
              <th data-column="C" title="Column C">
                Leg
              </th>
              {showLegStats ? (
                <th data-column="D" title="Column D">
                  Leg Mileage
                </th>
              ) : null}
              {showLegStats ? (
                <th data-column="E" title="Column E">
                  Elev Gain
                </th>
              ) : null}
              {showLegStats ? (
                <th data-column="F" title="Column F">
                  Elev Loss
                </th>
              ) : null}
              {showLegStats ? (
                <th data-column="G" title="Column G">
                  Net Elev Diff
                </th>
              ) : null}
              <th data-column="H" title="Column H">
                Estimated Pace
              </th>
              <th data-column="I" title="Column I">
                Leg Duration at Estimated Pace
              </th>
              <th data-column="J" title="Column J">
                Actual Pace
              </th>
              <th data-column="L" title="Column L">
                Est. Start Time
              </th>
              <th data-column="M" title="Column M">
                Actual Start Time
              </th>
              <th data-column="N" title="Column N">
                Delta to Pre-Race Estimates
              </th>
              <th data-column="O" title="Column O">
                Est. Van Stint Duration
              </th>
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
                  <td style={getVanCellStyle(row.runnerNumber, "name")}>{row.runnerName}</td>
                  <td style={getVanCellStyle(row.runnerNumber, "leg")}>{row.leg}</td>

                  {showLegStats ? (
                    <td style={getHeatmapStyle("mileage", row.legMileage, data.heatmap.mileage)}>
                      {isAdmin ? (
                        <input
                          type="number"
                          disabled={!canEdit}
                          step="0.01"
                          value={Number.isFinite(row.legMileage) ? row.legMileage : 0}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) {
                              updateRowLocal(row.leg, { legMileage: value });
                            }
                          }}
                          onBlur={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) {
                              void save(`/api/legs/${row.leg}`, { leg_mileage: value });
                            }
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
                          value={Number.isFinite(row.elevGainFt) ? row.elevGainFt : 0}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) {
                              updateRowLocal(row.leg, { elevGainFt: value });
                            }
                          }}
                          onBlur={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) {
                              void save(`/api/legs/${row.leg}`, { elev_gain_ft: value });
                            }
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
                          value={Number.isFinite(row.elevLossFt) ? row.elevLossFt : 0}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) {
                              updateRowLocal(row.leg, { elevLossFt: value });
                            }
                          }}
                          onBlur={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) {
                              void save(`/api/legs/${row.leg}`, { elev_loss_ft: value });
                            }
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
                          value={Number.isFinite(row.netElevDiffFt) ? row.netElevDiffFt : 0}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) {
                              updateRowLocal(row.leg, { netElevDiffFt: value });
                            }
                          }}
                          onBlur={(event) => {
                            const value = Number(event.target.value);
                            if (Number.isFinite(value)) {
                              void save(`/api/legs/${row.leg}`, { net_elev_diff_ft: value });
                            }
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
                      value={
                        row.leg <= 12
                          ? row.runnerDefaultPaceSpm
                          : row.estimatedPaceOverrideSpm ?? row.runnerDefaultPaceSpm
                      }
                      onSave={(value) => {
                        void saveEstimatedPace(row, value);
                      }}
                    />
                    <div className="muted">{formatSecondsToPace(row.estimatedPaceSpm)}</div>
                  </td>

                  <td style={getVanCellStyle(row.runnerNumber, "estimatedLegTime")}>
                    {formatSecondsToHMS(
                      row.estimatedPaceSpm !== null ? Math.round(row.legMileage * row.estimatedPaceSpm) : null
                    )}
                  </td>

                  <td style={getVanCellStyle(row.runnerNumber, "actualPace")}>{formatSecondsToPace(row.actualPaceSpm)}</td>

                  <td style={getVanCellStyle(row.runnerNumber, "updatedEstimatedStart")}>
                    {formatUTCISOStringToLA_friendly(row.updatedEstimatedStartTime)}
                  </td>

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

                  <td style={getVanCellStyle(row.runnerNumber, "estimatedStint")}>
                    {formatSecondsToHMS(row.estimatedVanStintSec)}
                  </td>

                  <td style={{ width: "max-content", minWidth: "max-content" }}>
                    {isAdmin ? (
                      <div style={{ display: "grid", gap: "0.3rem" }}>
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={row.exchangeLabel || ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateRowLocal(row.leg, { exchangeLabel: value });
                          }}
                          onBlur={(event) => {
                            const value = event.target.value;
                            void save(`/api/legs/${row.leg}`, { exchange_label: value });
                          }}
                        />
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={row.exchangeUrl || ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateRowLocal(row.leg, { exchangeUrl: value });
                          }}
                          onBlur={(event) => {
                            const value = event.target.value;
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
        </div>
      </section>
    </div>
  );
}
