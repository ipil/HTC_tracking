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
  onChange: (value: string | null) => void;
  onCommit: (value: string | null) => void;
};

export default function RaceDayTimeInput({
  disabled,
  value,
  defaultDay = "fri",
  defaultMeridiem = "am",
  onChange,
  onCommit
}: Props): React.JSX.Element {
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

  return (
    <div
      style={{
        width: "fit-content",
        display: "grid",
        gridTemplateColumns: "auto auto auto auto auto auto auto",
        gap: "0.35rem",
        alignItems: "center"
      }}
      onBlur={(event) => {
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
            onChange(nextIso("fri", hour, minute, meridiem));
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
            onChange(nextIso("sat", hour, minute, meridiem));
          }}
        />
        <span>Sat.</span>
      </label>
      <input
        type="number"
        disabled={disabled}
        inputMode="numeric"
        min="1"
        max="12"
        placeholder="hh"
        value={hour}
        onChange={(event) => {
          const nextHour = event.target.value;
          setHour(nextHour);
          onChange(nextIso(day, nextHour, minute, meridiem));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
        style={{ width: 56 }}
      />
      <span className="muted">:</span>
      <input
        type="number"
        disabled={disabled}
        inputMode="numeric"
        min="0"
        max="59"
        placeholder="mm"
        value={minute}
        onChange={(event) => {
          const nextMinute = event.target.value;
          setMinute(nextMinute);
          onChange(nextIso(day, hour, nextMinute, meridiem));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
        style={{ width: 62 }}
      />
      <label style={{ display: "inline-flex", gap: "0.2rem", alignItems: "center" }}>
        <input
          type="radio"
          disabled={disabled}
          checked={meridiem === "am"}
          onChange={() => {
            setMeridiem("am");
            onChange(nextIso(day, hour, minute, "am"));
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
            onChange(nextIso(day, hour, minute, "pm"));
          }}
        />
        <span>PM</span>
      </label>
    </div>
  );
}
