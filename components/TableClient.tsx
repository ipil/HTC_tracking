"use client";

import ImportLegsModal from "@/components/ImportLegsModal";
import PaceEditor from "@/components/PaceEditor";
import RaceDayTimeInput from "@/components/RaceDayTimeInput";
import { getHeatmapStyle, getNextLegIndex, getVanCellStyle } from "@/lib/formatRules";
import { loadWal, saveWal, walRemove, walUpsert, type WalStore } from "@/lib/offlineWal";
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
const VIEW_MODE_KEY = "htc-view-mode";
const DEBUG_WAL =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("debug");
type CachedTablePayload = { data: TableData; cachedAt: number };

function minMax(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function getEstimatedDurationSec(row: TableRow): number | null {
  if (!row.estimatedPaceSpm || !row.legMileage) return null;
  return row.estimatedPaceSpm * row.legMileage;
}

function getEstimatedFinishTimeIso(row: TableRow): string | null {
  const startIso =
    row.actualLegStartTime ??
    row.updatedEstimatedStartTime ??
    row.initialEstimatedStartTime;

  if (!startIso) return null;
  if (!row.estimatedPaceSpm || !row.legMileage) return null;

  const durationSec = row.estimatedPaceSpm * row.legMileage;
  const finishMs = Date.parse(startIso) + durationSec * 1000;

  return new Date(finishMs).toISOString();
}

function findNextLegToStart(rows: TableRow[], _nowMs: number): TableRow | null {
  for (const row of rows) {
    if (!row.actualLegStartTime) {
      return row;
    }
  }
  return null;
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
  const [viewMode, setViewMode] = useState<"race" | "plan">("plan");
  const [busy, setBusy] = useState(false);
  const [showLegStats, setShowLegStats] = useState(true);
  const [showRaceTiming, setShowRaceTiming] = useState(true);
  const [showLiveRaceStatus, setShowLiveRaceStatus] = useState(true);
  const [expandedUpNext, setExpandedUpNext] = useState<Record<number, boolean>>({});
  const [isOffline, setIsOffline] = useState(false);
  const [pendingOfflineEdits, setPendingOfflineEdits] = useState(0);
  const [walCount, setWalCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [lastStreamEventAt, setLastStreamEventAt] = useState<number | null>(null);
  const [serverNotifyCount, setServerNotifyCount] = useState(0);
  const [serverLastNotifyAt, setServerLastNotifyAt] = useState<number | null>(null);
  const [onlineTick, setOnlineTick] = useState(0);
  const [tick, setTick] = useState(0);

  // Keep refs for the latest data and WAL so mobile Safari refresh/pagehide cannot drop the last edit.
  const dataRef = useRef<TableData>(data);
  const dataVersionRef = useRef<number>(0);
  const walRef = useRef<WalStore>({});
  const flushTimersRef = useRef<Record<string, number>>({});
  const tableRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      if (stored === "race" || stored === "plan") {
        setViewMode(stored);
        return;
      }
    } catch {
      // ignore storage errors
    }

    const isCoarsePointer =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(pointer: coarse)").matches;
    const smallScreen =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(max-width: 640px)").matches;
    setViewMode(isCoarsePointer || smallScreen ? "race" : "plan");
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch {
      // ignore storage errors
    }
  }, [viewMode]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  function parseCachedTableValue(raw: string | null): { data: TableData | null; cachedAt: number } {
    if (!raw) {
      return { data: null, cachedAt: 0 };
    }

    try {
      const parsed = JSON.parse(raw) as CachedTablePayload | TableData;
      if (
        parsed &&
        typeof parsed === "object" &&
        "data" in parsed &&
        "cachedAt" in parsed &&
        parsed.data &&
        typeof parsed.cachedAt === "number"
      ) {
        return { data: parsed.data as TableData, cachedAt: parsed.cachedAt };
      }

      if (parsed && typeof parsed === "object" && "rows" in parsed) {
        return { data: parsed as TableData, cachedAt: 0 };
      }
    } catch {
      // ignore invalid cache payloads
    }

    return { data: null, cachedAt: 0 };
  }

  function persistTableCacheSync(nextData: TableData, timestamp = Date.now()): void {
    try {
      localStorage.setItem(TABLE_CACHE_KEY, JSON.stringify({ data: nextData, cachedAt: timestamp }));
    } catch {
      // ignore storage errors
    }
  }

  function setDataAndCache(next: TableData, timestamp = Date.now()) {
    dataRef.current = next;
    dataVersionRef.current = timestamp;
    setData(next);
    persistTableCacheSync(next, timestamp); // write-through so we don't lose "last edit" on fast refresh
  }

  function applyWalToTableData(baseData: TableData, wal: WalStore): TableData {
    const nextRows = baseData.rows.map((row) => ({ ...row }));

    for (const entry of Object.values(wal)) {
      const match = entry.path.match(/^\/api\/leg-inputs\/(\d+)$/);
      if (!match) {
        continue;
      }

      const leg = Number(match[1]);
      if (!Number.isInteger(leg)) {
        continue;
      }

      const row = nextRows.find((candidate) => candidate.leg === leg);
      if (!row) {
        continue;
      }

      if (entry.body && typeof entry.body === "object" && "actual_start_time" in entry.body) {
        row.actualLegStartTime = (entry.body.actual_start_time as string | null) ?? null;
      }
    }

    return {
      ...baseData,
      rows: nextRows,
    };
  }

  async function patchJson(path: string, body: any, opts?: { keepalive?: boolean }): Promise<void> {
    const response = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
      keepalive: opts?.keepalive ?? false,
    });

    if (!response.ok) {
      throw new Error(`PATCH failed for ${path}`);
    }
  }

  async function fetchFreshTable(): Promise<TableData> {
    const response = await fetch("/api/table", { cache: "no-store", credentials: "include" });
    if (!response.ok) {
      throw new Error("Failed to fetch /api/table");
    }
    return (await response.json()) as TableData;
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

  // Hydrate from table cache + WAL on mount so the last Actual Start edit survives fast refresh/navigation.
  useEffect(() => {
    const wal = loadWal();
    walRef.current = wal;
    setWalCount(Object.keys(wal).length);

    const { data: cachedData, cachedAt } = parseCachedTableValue(localStorage.getItem(TABLE_CACHE_KEY));
    const online = navigator.onLine;
    const baseData = online ? initialData ?? cachedData ?? initialData : cachedData ?? initialData;
    const baseAt = online ? Date.now() : cachedAt;
    const withWal = applyWalToTableData(baseData, wal);
    const recomputed = recomputeDerived(withWal);
    setDataAndCache(recomputed, baseAt);
    // initialData is the server-provided mount snapshot; hydrate exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Extra safety: flush cache when tab/app is backgrounded or navigated away (mobile Safari especially)
  useEffect(() => {
    const flushLocalState = () => {
      persistTableCacheSync(dataRef.current, dataVersionRef.current || Date.now());
      saveWal(walRef.current);
    };

    const flushWalKeepalive = () => {
      if (!navigator.onLine) {
        return;
      }

      for (const entry of Object.values(walRef.current)) {
        void patchJson(entry.path, entry.body, { keepalive: true })
          .then(() => {
            walRef.current = walRemove(walRef.current, entry.path);
            saveWal(walRef.current);
          })
          .catch(() => {
            // leave WAL entry in place
          });
      }
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        flushLocalState();
      }
    };

    const onPageHide = () => {
      flushLocalState();
      flushWalKeepalive();
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Track offline/online state
  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    const onOnline = () => {
      setIsOffline(false);
      setOnlineTick((tick) => tick + 1);
    };
    const onOffline = () => {
      setIsOffline(true);
      setStreamConnected(false);
    };

    update(); // initial value on mount
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
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
      setDataAndCache(recomputeDerived(json), Date.now());
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

    try {
      await patchJson(path, body);
      return true;
    } catch {
      return false;
    }
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

  async function flushWalEntry(path: string, body: any, opts?: { keepalive?: boolean }): Promise<boolean> {
    try {
      await patchJson(path, body, opts);
      walRef.current = walRemove(walRef.current, path);
      saveWal(walRef.current);
      setWalCount(Object.keys(walRef.current).length);
      return true;
    } catch {
      return false;
    }
  }

  function scheduleFlush(path: string, body: any): void {
    if (isOffline) {
      return;
    }

    const existingTimer = flushTimersRef.current[path];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    flushTimersRef.current[path] = window.setTimeout(() => {
      delete flushTimersRef.current[path];
      void flushWalEntry(path, body);
    }, 600);
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

  useEffect(() => {
    const handleOnline = () => {
      void (async () => {
        for (const entry of Object.values(walRef.current)) {
          await flushWalEntry(entry.path, entry.body);
        }
        await refresh();
      })();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (!event.key || event.newValue === null) {
        return;
      }

      if (event.key === TABLE_CACHE_KEY) {
        const { data: parsedData, cachedAt } = parseCachedTableValue(event.newValue);
        if (!parsedData || cachedAt <= dataVersionRef.current) {
          return;
        }
        const next = recomputeDerived(applyWalToTableData(parsedData, walRef.current));
        setDataAndCache(next, cachedAt);
        return;
      }

      if (event.key === "htc-write-ahead-log-v1") {
        walRef.current = loadWal();
        setWalCount(Object.keys(walRef.current).length);
      }
    };

    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  useEffect(() => {
    if (isOffline) {
      setStreamConnected(false);
      return;
    }

    const es = new EventSource("/api/stream");

    const shouldSkipServerApply = (): boolean => {
      if (Object.keys(walRef.current).length > 0 || pendingOfflineEdits > 0) {
        return true;
      }

      const active = document.activeElement;
      return Boolean(
        active instanceof HTMLElement &&
          tableRootRef.current?.contains(active) &&
          ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)
      );
    };

    const applyServerUpdate = async () => {
      if (shouldSkipServerApply()) {
        return;
      }

      try {
        const serverData = await fetchFreshTable();
        const serverDataWithWal = recomputeDerived(applyWalToTableData(serverData, walRef.current));
        setDataAndCache(serverDataWithWal, Date.now());
        if (DEBUG_WAL) {
          setLastSyncAt(Date.now());
        }
      } catch {
        // ignore server sync failures
      }
    };

    const onReady = () => {
      setStreamConnected(true);
    };

    const onUpdate = () => {
      setLastStreamEventAt(Date.now());
      void applyServerUpdate();
    };

    const onDebug = (event: Event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent<string>).data) as {
          notifyCount?: number;
          lastNotifyAt?: number | null;
        };
        if (typeof parsed.notifyCount === "number") {
          setServerNotifyCount(parsed.notifyCount);
        }
        setServerLastNotifyAt(typeof parsed.lastNotifyAt === "number" ? parsed.lastNotifyAt : null);
      } catch {
        // ignore malformed debug payloads
      }
    };

    const onError = () => {
      setStreamConnected(false);
    };

    es.addEventListener("ready", onReady);
    es.addEventListener("update", onUpdate);
    es.addEventListener("debug", onDebug);
    es.onerror = onError;

    return () => {
      es.removeEventListener("ready", onReady);
      es.removeEventListener("update", onUpdate);
      es.removeEventListener("debug", onDebug);
      es.close();
      setStreamConnected(false);
    };
  }, [isOffline, onlineTick, pendingOfflineEdits]);

  useEffect(() => {
    function shouldSkipPolling(): boolean {
      if (!navigator.onLine) {
        return true;
      }
      if (Object.keys(walRef.current).length > 0 || pendingOfflineEdits > 0) {
        return true;
      }

      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        tableRootRef.current?.contains(active) &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)
      ) {
        return true;
      }

      return false;
    }

    async function syncFromServer(): Promise<void> {
      if (shouldSkipPolling()) {
        return;
      }

      try {
        const serverData = await fetchFreshTable();
        const serverDataWithWal = recomputeDerived(applyWalToTableData(serverData, walRef.current));
        setDataAndCache(serverDataWithWal, Date.now());
        if (DEBUG_WAL) {
          setLastSyncAt(Date.now());
        }
      } catch {
        // ignore sync failures and keep current state
      }
    }

    const intervalId = window.setInterval(() => {
      void syncFromServer();
    }, 8000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncFromServer();
      }
    };

    const onFocus = () => {
      void syncFromServer();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    void syncFromServer();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pendingOfflineEdits]);

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

  function updateRowLocalDurable(leg: number, patchObj: Partial<TableRow>): TableData {
    const next = recomputeDerived({
      ...dataRef.current,
      rows: dataRef.current.rows.map((row) => (row.leg === leg ? { ...row, ...patchObj } : row)),
    });
    setDataAndCache(next);
    return next;
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

  function handleActualStartChange(leg: number, iso: string | null) {
    updateRowLocalDurable(leg, { actualLegStartTime: iso });

    const path = `/api/leg-inputs/${leg}`;
    const body = { actual_start_time: iso };
    walRef.current = walUpsert(walRef.current, path, body);
    saveWal(walRef.current);
    setWalCount(Object.keys(walRef.current).length);

    if (DEBUG_WAL) {
      const at = Date.now();
      let cacheParsable = false;
      try {
        const rawCache = localStorage.getItem(TABLE_CACHE_KEY);
        cacheParsable = rawCache !== null && JSON.parse(rawCache) !== null;
      } catch {
        cacheParsable = false;
      }

      const hasWalEntry = Boolean(walRef.current[path]);
      console.log(
        `[htc-wal] leg=${leg} iso=${iso ?? "null"} at=${at} cacheParsable=${cacheParsable} walEntry=${hasWalEntry}`
      );
      (window as any).__htcDebug = {
        lastActualStart: { leg, iso, at },
        walKeys: Object.keys(walRef.current),
      };
    }

    scheduleFlush(path, body);
  }

  function handleActualStartCommit(leg: number, iso: string | null) {
    const path = `/api/leg-inputs/${leg}`;
    const body = { actual_start_time: iso };
    walRef.current = walUpsert(walRef.current, path, body);
    saveWal(walRef.current);
    setWalCount(Object.keys(walRef.current).length);

    const existingTimer = flushTimersRef.current[path];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      delete flushTimersRef.current[path];
    }

    if (!isOffline) {
      void flushWalEntry(path, body);
    }
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

  const liveVanStatus = useMemo(() => {
    const now = Date.now();
    const nextLegToStart = findNextLegToStart(data.rows, now);
    const lastStarted = [...data.rows].reverse().find((row) => !!row.actualLegStartTime) ?? null;

    const rowsWithTimeline = data.rows.map((row) => {
      const startIso = row.actualLegStartTime ?? row.updatedEstimatedStartTime;
      const startMs = startIso ? Date.parse(startIso) : null;
      const durationSec = getEstimatedDurationSec(row);
      const endMs = startMs && durationSec ? startMs + durationSec * 1000 : null;

      return {
        row,
        startIso,
        startMs,
        durationSec,
        endMs,
      };
    });

    const actualCurrent =
      rowsWithTimeline.find(
        ({ row, startMs, endMs }) =>
          row.actualLegStartTime && startMs !== null && startMs <= now && (endMs === null || now < endMs)
      ) ?? null;

    const estimatedCurrent =
      rowsWithTimeline.find(
        ({ row, startMs, endMs }) =>
          row.updatedEstimatedStartTime &&
          startMs !== null &&
          startMs <= now &&
          (endMs === null || now < endMs)
      ) ?? null;

    const currentEntry =
      (lastStarted
        ? rowsWithTimeline.find((entry) => entry.row.leg === lastStarted.leg) ?? null
        : null) ??
      actualCurrent ??
      estimatedCurrent ??
      rowsWithTimeline[0] ??
      null;
    if (!currentEntry) {
      return null;
    }

    const raceStarted = currentEntry.startMs !== null ? currentEntry.startMs <= now : false;
    const countdownSec =
      currentEntry.endMs !== null ? Math.max(0, Math.floor((currentEntry.endMs - now) / 1000)) : null;

    return {
      raceStarted,
      currentRow: currentEntry.row,
      currentLegIndex: data.rows.findIndex((candidate) => candidate.leg === currentEntry.row.leg),
      nextLegToStart,
      activeVan: currentEntry.row.runnerNumber <= 6 ? "Van 1" : "Van 2",
      etaIso:
        currentEntry.endMs !== null && Number.isFinite(currentEntry.endMs)
          ? new Date(currentEntry.endMs).toISOString()
          : null,
      countdownSec,
      isFinalLeg: currentEntry.row.leg === 36,
    };
  }, [data.rows, tick]);

  const upNextRows = useMemo(() => {
    if (!liveVanStatus) {
      return [];
    }
    const startIndex = liveVanStatus.nextLegToStart
      ? data.rows.findIndex((candidate) => candidate.leg === liveVanStatus.nextLegToStart?.leg)
      : Math.max(0, liveVanStatus.currentLegIndex + 1);
    return data.rows.slice(startIndex, startIndex + 3);
  }, [data.rows, liveVanStatus]);

  function renderLiveRaceStatusPanel() {
    if (!liveVanStatus) {
      return null;
    }

    return (
      <section className="panel" style={{ display: "grid", gap: "0.65rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            className="secondary"
            type="button"
            aria-label={showLiveRaceStatus ? "Collapse live race status" : "Expand live race status"}
            onClick={() => setShowLiveRaceStatus((value) => !value)}
            style={{ padding: "0.15rem 0.45rem", lineHeight: 1 }}
          >
            {showLiveRaceStatus ? "\u25be" : "\u25b8"}
          </button>
          <h2>Live Race Status</h2>
        </div>

        {showLiveRaceStatus ? (
          <>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.04em", color: "#5c665f" }}>
              {liveVanStatus.raceStarted ? "NOW RUNNING" : "RACE NOT STARTED"}
            </div>
            <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>
              Runner {liveVanStatus.currentRow.runnerNumber}
              {liveVanStatus.currentRow.runnerName ? ` — ${liveVanStatus.currentRow.runnerName}` : ""}
            </div>
            <div style={{ fontSize: "1rem" }}>
              <strong>Active:</strong> {liveVanStatus.activeVan}
            </div>
            <div style={{ display: "grid", gap: "0.2rem" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.04em", color: "#5c665f" }}>
                NEXT EXCHANGE
              </div>
              <div style={{ fontSize: "1rem" }}>
                {liveVanStatus.isFinalLeg
                  ? "Final Leg — Heading to Finish"
                  : liveVanStatus.currentRow.exchangeLabel || "—"}
              </div>
              {!liveVanStatus.isFinalLeg && liveVanStatus.currentRow.exchangeUrl ? (
                <div>
                  <a href={liveVanStatus.currentRow.exchangeUrl} target="_blank" rel="noreferrer">
                    Navigate →
                  </a>
                </div>
              ) : null}
            </div>
            <div style={{ display: "grid", gap: "0.35rem" }}>
              <div>
                <strong>ETA</strong>
              </div>
              <div style={{ fontSize: "1rem" }}>{formatUTCISOStringToLA_friendly(liveVanStatus.etaIso)}</div>
            </div>
            <div style={{ display: "grid", gap: "0.35rem" }}>
              <div>
                <strong>In</strong>
              </div>
              <div style={{ fontSize: "1.1rem", fontVariantNumeric: "tabular-nums" }}>
                {formatSecondsToHMS(liveVanStatus.countdownSec)}
              </div>
            </div>
          </>
        ) : null}
      </section>
    );
  }

  return (
    <div ref={tableRootRef} style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          className={viewMode === "race" ? "" : "secondary"}
          type="button"
          onClick={() => setViewMode("race")}
        >
          Race Mode
        </button>
        <button
          className={viewMode === "plan" ? "" : "secondary"}
          type="button"
          onClick={() => setViewMode("plan")}
        >
          Planning Mode
        </button>
      </div>

      {viewMode === "race" ? (
        <>
          {renderLiveRaceStatusPanel()}

          <section className="panel" style={{ display: "grid", gap: "0.75rem" }}>
            <h2>Up Next</h2>
            {upNextRows.map((row) => {
              const expanded = Boolean(expandedUpNext[row.leg]);
              const startIso = row.actualLegStartTime ?? row.updatedEstimatedStartTime;
              const finishIso = getEstimatedFinishTimeIso(row);
              const finishParts = finishIso ? formatUTCISOStringToLARaceDayTime(finishIso) : null;

              return (
                <button
                  key={row.leg}
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setExpandedUpNext((prev) => ({
                      ...prev,
                      [row.leg]: !prev[row.leg],
                    }))
                  }
                  style={{
                    textAlign: "left",
                    display: "grid",
                    gap: "0.35rem",
                    padding: "0.75rem",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    Leg {row.leg} — Runner {row.runnerNumber}
                    {row.runnerName ? ` — ${row.runnerName}` : ""}
                  </div>
                  <div>{row.exchangeLabel || "—"}</div>
                  <div className="muted">
                    Start: {formatUTCISOStringToLA_friendly(startIso)} | Estimated finish: {finishParts ? `${finishParts.day === "sat" ? "Sat." : "Fri."} ${finishParts.hour}:${finishParts.minute} ${finishParts.meridiem.toUpperCase()}` : "—"}
                  </div>
                  {expanded ? (
                    <div style={{ display: "grid", gap: "0.25rem" }}>
                      <div>Pace: {formatSecondsToPace(row.estimatedPaceSpm)}</div>
                      <div>
                        Mileage: {row.legMileage.toFixed(2)} mi | Gain: {row.elevGainFt} ft | Loss: {row.elevLossFt} ft
                      </div>
                      {row.exchangeUrl ? (
                        <div>
                          <a href={row.exchangeUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                            Navigate →
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </section>

          <section className="panel" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <span className="muted" style={{ alignSelf: "center" }}>
              {liveVanStatus?.nextLegToStart
                ? `Next to start: Leg ${liveVanStatus.nextLegToStart.leg} — Runner ${liveVanStatus.nextLegToStart.runnerNumber}${liveVanStatus.nextLegToStart.runnerName ? ` (${liveVanStatus.nextLegToStart.runnerName})` : ""}`
                : "All legs started"}
            </span>
            <button
              type="button"
              disabled={!canEdit || !liveVanStatus?.nextLegToStart}
              onClick={() => {
                const target = findNextLegToStart(data.rows, Date.now());
                if (!target) {
                  return;
                }
                const iso = new Date().toISOString();
                handleActualStartChange(target.leg, iso);
                handleActualStartCommit(target.leg, iso);
              }}
            >
              {liveVanStatus?.nextLegToStart
                ? `Mark Start Now (Leg ${liveVanStatus.nextLegToStart.leg} — Runner ${liveVanStatus.nextLegToStart.runnerNumber})`
                : "Mark Start Now"}
            </button>
            <button className="secondary" type="button" onClick={() => setViewMode("plan")}>
              Open Spreadsheet
            </button>
          </section>
        </>
      ) : (
        <>
          {renderLiveRaceStatusPanel()}

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
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            className="secondary"
            type="button"
            aria-label={showRaceTiming ? "Collapse race start and finish times" : "Expand race start and finish times"}
            onClick={() => setShowRaceTiming((value) => !value)}
            style={{ padding: "0.15rem 0.45rem", lineHeight: 1 }}
          >
            {showRaceTiming ? "\u25be" : "\u25b8"}
          </button>
          <h2>Race Start and Finish Times</h2>
        </div>

        {showRaceTiming ? (
          <>
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
              {isAdmin ? <ImportLegsModal onImported={refresh} /> : null}
              {isAdmin ? (
                <button className="secondary" type="button" onClick={() => void resetActualStartTimes()}>
                  Reset Actual Start Times
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </section>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button className="secondary" type="button" onClick={() => setShowLegStats((value) => !value)}>
          {showLegStats ? "Hide" : "Show"} Leg Stats
        </button>
      </div>

      <section className="table-wrap">
        {DEBUG_WAL ? (
          <div className="muted" style={{ padding: "0.5rem 0.6rem", fontSize: "0.8rem" }}>
            WAL pending: {walCount} | Offline: {isOffline ? "yes" : "no"} | Stream: {streamConnected ? "connected" : "disconnected"} | Last stream: {lastStreamEventAt ? new Date(lastStreamEventAt).toLocaleTimeString() : "-"} | Last sync: {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : "-"} | Server NOTIFY count: {serverNotifyCount} | Server last NOTIFY: {serverLastNotifyAt ? new Date(serverLastNotifyAt).toLocaleTimeString() : "-"}
          </div>
        ) : null}
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
                        handleActualStartChange(row.leg, iso);
                      }}
                      onCommit={(iso) => {
                        handleActualStartCommit(row.leg, iso);
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
        </>
      )}
    </div>
  );
}
