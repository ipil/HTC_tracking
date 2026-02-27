"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ParsedRow = {
  leg: number;
  leg_mileage: number;
  elev_gain_ft: number;
  elev_loss_ft: number;
  net_elev_diff_ft: number;
  exchange_label: string;
  exchange_url: string;
};

type Props = {
  onImported: () => Promise<void>;
};

function parseRows(input: string): ParsedRow[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("Paste at least one row.");
  }

  const parsed: ParsedRow[] = [];

  for (const [index, line] of lines.entries()) {
    const cells = line.split("\t");
    if (cells.every((cell) => cell.trim() === "")) {
      continue;
    }

    const firstCell = cells[0]?.trim().toLowerCase();
    if (index === 0 && (firstCell === "leg" || Number.isNaN(Number(cells[0])))) {
      continue;
    }

    if (cells.length < 7) {
      throw new Error(`Row ${index + 1} must have 7 columns.`);
    }

    const leg = Number(cells[0]);
    const legMileage = Number(cells[1]);
    const elevGain = Number(cells[2]);
    const elevLoss = Number(cells[3]);
    const netElevDiff = Number(cells[4]);

    if (!Number.isInteger(leg) || leg < 1 || leg > 36) {
      throw new Error(`Row ${index + 1} has an invalid leg number.`);
    }

    if (![legMileage, elevGain, elevLoss, netElevDiff].every((value) => Number.isFinite(value))) {
      throw new Error(`Row ${index + 1} has invalid numeric values.`);
    }

    parsed.push({
      leg,
      leg_mileage: legMileage,
      elev_gain_ft: elevGain,
      elev_loss_ft: elevLoss,
      net_elev_diff_ft: netElevDiff,
      exchange_label: cells[5]?.trim() ?? "",
      exchange_url: cells[6]?.trim() ?? ""
    });
  }

  if (parsed.length === 0) {
    throw new Error("No importable rows found.");
  }

  return parsed;
}

export default function ImportLegsModal({ onImported }: Props): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleImport() {
    setError("");

    let rows: ParsedRow[];
    try {
      rows = parseRows(value);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Could not parse pasted data.");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/admin/import-legs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows })
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Import failed.");
      setBusy(false);
      return;
    }

    setBusy(false);
    setValue("");
    setOpen(false);
    await onImported();
    router.refresh();
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Import Spreadsheet Data
      </button>

      {open ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 21, 18, 0.52)",
            display: "grid",
            placeItems: "center",
            padding: "1rem",
            zIndex: 10
          }}
        >
          <div className="panel" style={{ width: "min(760px, 100%)", display: "grid", gap: "0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Import Spreadsheet Data</h2>
              <button className="secondary" type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <p className="muted">Copy rows from Google Sheets and paste here.</p>
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={"Leg\tMileage\tElev Gain\tElev Loss\tNet Elev. Diff.\tExchange Name\tExchange URL"}
              rows={12}
              style={{
                width: "100%",
                border: "1px solid #d4dbd4",
                borderRadius: 8,
                padding: "0.6rem",
                font: "inherit"
              }}
            />
            {error ? <div className="warn">{error}</div> : null}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button className="secondary" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => void handleImport()}>
                {busy ? "Importing..." : "Import"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
