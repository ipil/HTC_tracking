import { DateTime } from "luxon";

export const LA_TIMEZONE = "America/Los_Angeles";
export const RACE_DAY_DATE_MAP = {
  fri: "2026-08-28",
  sat: "2026-08-29"
} as const;

export type RaceDayKey = keyof typeof RACE_DAY_DATE_MAP;

export function formatSecondsToHMS(totalSec: number | null): string {
  if (totalSec === null || Number.isNaN(totalSec)) {
    return "-";
  }

  const sign = totalSec < 0 ? "-" : "";
  const sec = Math.abs(Math.round(totalSec));
  const hours = Math.floor(sec / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((sec % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (sec % 60).toString().padStart(2, "0");

  return `${sign}${hours}:${minutes}:${seconds}`;
}

export function formatSecondsToPace(secondsPerMile: number | null): string {
  if (secondsPerMile === null || !Number.isFinite(secondsPerMile)) {
    return "-";
  }

  const rounded = Math.round(secondsPerMile);
  const minutes = Math.floor(rounded / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (rounded % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}/mi`;
}

export function parseLA_datetimeLocalToUTCISOString(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = DateTime.fromISO(value, { zone: LA_TIMEZONE });
  if (!parsed.isValid) {
    return null;
  }

  return parsed.toUTC().toISO();
}

export function formatUTCISOStringToLA_datetimeLocal(value: string | null): string {
  if (!value) {
    return "";
  }

  const parsed = DateTime.fromISO(value, { zone: "utc" }).setZone(LA_TIMEZONE);
  if (!parsed.isValid) {
    return "";
  }

  return parsed.toFormat("yyyy-LL-dd'T'HH:mm");
}

export function formatUTCISOStringToLA_friendly(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = DateTime.fromISO(value, { zone: "utc" }).setZone(LA_TIMEZONE);
  if (!parsed.isValid) {
    return "-";
  }

  return parsed.toFormat("ccc h:mm a");
}

export function normalizeUTCISOString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const iso = DateTime.fromISO(value, { zone: "utc" });
    if (iso.isValid) {
      return iso.toUTC().toJSDate().toISOString();
    }

    const sql = DateTime.fromSQL(value, { zone: "utc" });
    if (sql.isValid) {
      return sql.toUTC().toJSDate().toISOString();
    }

    const jsDate = new Date(value);
    if (!Number.isNaN(jsDate.getTime())) {
      return jsDate.toISOString();
    }
  }

  return null;
}

export function parseLARaceDayTimeToUTCISOString(day: RaceDayKey, time: string): string | null {
  if (!time) {
    return null;
  }

  const date = RACE_DAY_DATE_MAP[day];
  const parsed = DateTime.fromISO(`${date}T${time}`, { zone: LA_TIMEZONE });
  if (!parsed.isValid) {
    return null;
  }

  return parsed.toUTC().toISO();
}

export function formatUTCISOStringToLARaceDayTime(
  value: string | null
): { day: RaceDayKey; time: string } {
  if (!value) {
    return { day: "fri", time: "" };
  }

  const parsed = DateTime.fromISO(value, { zone: "utc" }).setZone(LA_TIMEZONE);
  if (!parsed.isValid) {
    return { day: "fri", time: "" };
  }

  const dateKey = parsed.toFormat("yyyy-LL-dd");
  const day = dateKey === RACE_DAY_DATE_MAP.sat ? "sat" : "fri";

  return {
    day,
    time: parsed.toFormat("HH:mm")
  };
}
