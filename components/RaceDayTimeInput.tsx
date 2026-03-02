"use client";

import { useEffect, useState } from "react";
import {
  formatUTCISOStringToLARaceDayTime,
  parseLARaceDayTimeToUTCISOString,
  type RaceDayKey
} from "@/lib/time";

type Props = {
  disabled: boolean;
  value: string | null;
  defaultDay?: RaceDayKey;
  defaultMeridiem?: "am" | "pm";
  commitMode?: "blur" | "enter" | "none";
  onChange: (value: string | null) => void;
  onCommit: (value: string | null) => void;
};

export default function RaceDayTimeInput({
  disabled,
  value,
  defaultDay = "fri",
  defaultMeridiem = "am",
  commitMode = "blur",
  onChange,
  onCommit
}: Props): React.JSX.Element {
  const isCoarsePointer =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches;
  const smallScreen =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(max-width: 640px)").matches;
  const isMobileUI = isCoarsePointer || smallScreen;
  const initial = value
    ? formatUTCISOStringToLARaceDayTime(value)
    : { day: defaultDay, hour: "", minute: "", meridiem: defaultMeridiem };
  const [day, setDay] = useState<RaceDayKey>(initial.day);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [meridiem, setMeridiem] = useState<"am" | "pm">(initial.meridiem);

  useEffect(() => {
    const next = value
      ? formatUTCISOStringToLARaceDayTime(value)
      : { day: defaultDay, hour: "", minute: "", meridiem: defaultMeridiem };
    setDay(next.day);
    setHour(next.hour);
    setMinute(next.minute);
    setMeridiem(next.meridiem);
  }, [defaultDay, defaultMeridiem, value]);

  function nextIso(
    nextDay: RaceDayKey,
    nextHour: string,
    nextMinute: string,
    nextMeridiem: "am" | "pm"
  ): string | null {
    if (!nextHour || !nextMinute) {
      return null;
    }

    const hourNum = Number(nextHour);
    const minuteNum = Number(nextMinute);
    if (!Number.isInteger(hourNum) || hourNum < 1 || hourNum > 12) {
      return null;
    }
    if (!Number.isInteger(minuteNum) || minuteNum < 0 || minuteNum > 59) {
      return null;
    }

    const hour24 =
      nextMeridiem === "am"
        ? hourNum % 12
        : hourNum % 12 === 0
          ? 12
          : hourNum + 12;

    const time = `${String(hour24).padStart(2, "0")}:${String(minuteNum).padStart(2, "0")}`;
    return parseLARaceDayTimeToUTCISOString(nextDay, time);
  }

  function commit() {
    onCommit(nextIso(day, hour, minute, meridiem));
  }

  function maybeCommitMobile(iso: string | null) {
    if (isMobileUI && commitMode === "blur" && onCommit && hour && minute) {
      onCommit(iso);
    }
  }

  return (
    <div
      style={{
        width: "fit-content",
        display: "grid",
        gridTemplateColumns: "auto auto auto auto auto auto auto",
        gap: "0.35rem",
        alignItems: "center"
      }}
      onBlurCapture={(event) => {
        // Blur is unreliable on mobile refresh; onChange is the durable path.
        if (commitMode !== "blur") {
          return;
        }

        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          commit();
        }
      }}
    >
      <label style={{ display: "inline-flex", gap: "0.2rem", alignItems: "center" }}>
        <input
          type="radio"
          disabled={disabled}
          checked={day === "fri"}
          onChange={() => {
            setDay("fri");
            const iso = nextIso("fri", hour, minute, meridiem);
            onChange(iso);
            maybeCommitMobile(iso);
          }}
        />
        <span>Fri.</span>
      </label>
      <label style={{ display: "inline-flex", gap: "0.2rem", alignItems: "center" }}>
        <input
          type="radio"
          disabled={disabled}
          checked={day === "sat"}
          onChange={() => {
            setDay("sat");
            const iso = nextIso("sat", hour, minute, meridiem);
            onChange(iso);
            maybeCommitMobile(iso);
          }}
        />
        <span>Sat.</span>
      </label>
      {isMobileUI ? (
        <select
          aria-label="Hour"
          disabled={disabled}
          value={hour}
          onChange={(event) => {
            const nextHour = event.target.value;
            setHour(nextHour);
            const iso = nextIso(day, nextHour, minute, meridiem);
            onChange(iso);
            if (nextHour && minute) {
              maybeCommitMobile(iso);
            }
          }}
          style={{ width: 68 }}
        >
          <option value="">hh</option>
          {Array.from({ length: 12 }, (_, index) => {
            const value = String(index + 1);
            return (
              <option key={value} value={value}>
                {value}
              </option>
            );
          })}
        </select>
      ) : (
        <input
          type="number"
          disabled={disabled}
          inputMode="numeric"
          min="1"
          max="12"
          placeholder="hh"
          value={hour}
          onChange={(event) => {
            const nextHour = event.target.value.replace(/[^\d]/g, "").slice(0, 2);
            setHour(nextHour);
            onChange(nextIso(day, nextHour, minute, meridiem));
          }}
          onKeyDown={(event) => {
            if (commitMode === "enter" && event.key === "Enter") {
              commit();
              (event.currentTarget as HTMLInputElement).blur();
            }
          }}
          style={{ width: 56 }}
        />
      )}
      <span className="muted">:</span>
      {isMobileUI ? (
        <select
          aria-label="Minute"
          disabled={disabled}
          value={minute}
          onChange={(event) => {
            const nextMinute = event.target.value;
            setMinute(nextMinute);
            const iso = nextIso(day, hour, nextMinute, meridiem);
            onChange(iso);
            if (hour && nextMinute) {
              maybeCommitMobile(iso);
            }
          }}
          style={{ width: 74 }}
        >
          <option value="">mm</option>
          {Array.from({ length: 60 }, (_, index) => {
            const value = String(index).padStart(2, "0");
            return (
              <option key={value} value={value}>
                {value}
              </option>
            );
          })}
        </select>
      ) : (
        <input
          type="number"
          disabled={disabled}
          inputMode="numeric"
          min="0"
          max="59"
          placeholder="mm"
          value={minute}
          onChange={(event) => {
            const nextMinute = event.target.value.replace(/[^\d]/g, "").slice(0, 2);
            setMinute(nextMinute);
            onChange(nextIso(day, hour, nextMinute, meridiem));
          }}
          onKeyDown={(event) => {
            if (commitMode === "enter" && event.key === "Enter") {
              commit();
              (event.currentTarget as HTMLInputElement).blur();
            }
          }}
          style={{ width: 62 }}
        />
      )}
      <label style={{ display: "inline-flex", gap: "0.2rem", alignItems: "center" }}>
        <input
          type="radio"
          disabled={disabled}
          checked={meridiem === "am"}
          onChange={() => {
            setMeridiem("am");
            const iso = nextIso(day, hour, minute, "am");
            onChange(iso);
            maybeCommitMobile(iso);
          }}
        />
        <span>AM</span>
      </label>
      <label style={{ display: "inline-flex", gap: "0.2rem", alignItems: "center" }}>
        <input
          type="radio"
          disabled={disabled}
          checked={meridiem === "pm"}
          onChange={() => {
            setMeridiem("pm");
            const iso = nextIso(day, hour, minute, "pm");
            onChange(iso);
            maybeCommitMobile(iso);
          }}
        />
        <span>PM</span>
      </label>
    </div>
  );
}
