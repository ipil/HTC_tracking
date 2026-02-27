import { DateTime } from "luxon";

export const LA_TIMEZONE = "America/Los_Angeles";

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
