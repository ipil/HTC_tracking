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
  onChange: (value: string | null) => void;
  onCommit: (value: string | null) => void;
};

export default function RaceDayTimeInput({
  disabled,
  value,
  onChange,
  onCommit
}: Props): React.JSX.Element {
  const initial = formatUTCISOStringToLARaceDayTime(value);
  const [day, setDay] = useState<RaceDayKey>(initial.day);
  const [time, setTime] = useState(initial.time);

  useEffect(() => {
    const next = formatUTCISOStringToLARaceDayTime(value);
    setDay(next.day);
    setTime(next.time);
  }, [value]);

  function nextIso(nextDay: RaceDayKey, nextTime: string): string | null {
    return parseLARaceDayTimeToUTCISOString(nextDay, nextTime);
  }

  function commit() {
    onCommit(nextIso(day, time));
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "90px minmax(0, 1fr)",
        gap: "0.35rem",
        alignItems: "center"
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          commit();
        }
      }}
    >
      <select
        disabled={disabled}
        value={day}
        onChange={(event) => {
          const nextDay = event.target.value as RaceDayKey;
          setDay(nextDay);
          onChange(nextIso(nextDay, time));
        }}
      >
        <option value="fri">Fri.</option>
        <option value="sat">Sat.</option>
      </select>
      <input
        type="time"
        disabled={disabled}
        value={time}
        onChange={(event) => {
          const nextTime = event.target.value;
          setTime(nextTime);
          onChange(nextIso(day, nextTime));
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
