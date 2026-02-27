"use client";

import { useEffect, useState } from "react";

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

type Props = {
  disabled: boolean;
  value: number | null;
  onSave: (value: number | null) => void;
};

export default function PaceEditor({ disabled, value, onSave }: Props): React.JSX.Element {
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
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
        gap: "0.25rem",
        alignItems: "center"
      }}
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
