import { DateTime } from "luxon";

export function computeInitialEstimates(
  raceStartUtcIso: string | null,
  estimatedDurationsSec: Array<number | null>
): Array<string | null> {
  const results = new Array<string | null>(estimatedDurationsSec.length).fill(null);
  if (!raceStartUtcIso) {
    return results;
  }

  let cursor = DateTime.fromISO(raceStartUtcIso, { zone: "utc" });
  for (let i = 0; i < estimatedDurationsSec.length; i += 1) {
    results[i] = cursor.toISO();
    const duration = estimatedDurationsSec[i];
    if (duration !== null && Number.isFinite(duration)) {
      cursor = cursor.plus({ seconds: duration });
    }
  }

  return results;
}

export function computeUpdatedEstimates(
  initial: Array<string | null>,
  actualStarts: Array<string | null>,
  estimatedDurationsSec: Array<number | null>
): Array<string | null> {
  const out = [...initial];

  for (let i = 1; i < out.length; i += 1) {
    const prevDuration = estimatedDurationsSec[i - 1];
    if (prevDuration === null || !Number.isFinite(prevDuration)) {
      continue;
    }

    const anchor = actualStarts[i - 1] ?? out[i - 1];
    if (!anchor) {
      continue;
    }

    out[i] = DateTime.fromISO(anchor, { zone: "utc" }).plus({ seconds: prevDuration }).toISO();
  }

  return out;
}

export function computeActualDurations(
  actualStarts: Array<string | null>,
  finishUtcIso: string | null
): Array<number | null> {
  const out = new Array<number | null>(actualStarts.length).fill(null);

  for (let i = 0; i < actualStarts.length - 1; i += 1) {
    const current = actualStarts[i];
    const next = actualStarts[i + 1];
    if (current && next) {
      const currentDt = DateTime.fromISO(current, { zone: "utc" });
      const nextDt = DateTime.fromISO(next, { zone: "utc" });
      out[i] = Math.round(nextDt.diff(currentDt, "seconds").seconds);
    }
  }

  const last = actualStarts[actualStarts.length - 1];
  if (last && finishUtcIso) {
    const lastDt = DateTime.fromISO(last, { zone: "utc" });
    const finishDt = DateTime.fromISO(finishUtcIso, { zone: "utc" });
    out[out.length - 1] = Math.round(finishDt.diff(lastDt, "seconds").seconds);
  }

  return out;
}

export function computeVanStints(
  estimatedDurations: Array<number | null>,
  actualDurations: Array<number | null>
): {
  estimated: Array<number | null>;
  actual: Array<number | null>;
} {
  const estimated = new Array<number | null>(estimatedDurations.length).fill(null);
  const actual = new Array<number | null>(actualDurations.length).fill(null);

  const markers = [6, 12, 18, 24, 30, 36];
  for (const marker of markers) {
    const idx = marker - 1;
    const start = idx - 5;

    let estSum = 0;
    let estComplete = true;
    for (let i = start; i <= idx; i += 1) {
      const hybridDuration = actualDurations[i] ?? estimatedDurations[i];
      if (hybridDuration === null) {
        estComplete = false;
        break;
      }
      estSum += hybridDuration;
    }
    estimated[idx] = estComplete ? estSum : null;

    let actualSum = 0;
    let actualComplete = true;
    for (let i = start; i <= idx; i += 1) {
      if (actualDurations[i] === null) {
        actualComplete = false;
        break;
      }
      actualSum += actualDurations[i] ?? 0;
    }
    actual[idx] = actualComplete ? actualSum : null;
  }

  return { estimated, actual };
}
