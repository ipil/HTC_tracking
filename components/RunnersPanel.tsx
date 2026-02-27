"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PaceEditor from "@/components/PaceEditor";
import type { Runner } from "@/types/domain";

type SaveState = Record<number, string>;

type Props = {
  initialRunners: Runner[];
};

export default function RunnersPanel({ initialRunners }: Props): React.JSX.Element {
  const router = useRouter();
  const [runners, setRunners] = useState<Runner[]>(initialRunners);
  const [status, setStatus] = useState<SaveState>({});

  function updateRunnerLocal(runnerNumber: number, patch: Partial<Runner>) {
    setRunners((prev) =>
      prev.map((runner) =>
        runner.runner_number === runnerNumber
          ? {
              ...runner,
              ...patch
            }
          : runner
      )
    );
  }

  async function saveRunner(runnerNumber: number, body: Partial<Runner>) {
    setStatus((prev) => ({ ...prev, [runnerNumber]: "Saving..." }));

    const res = await fetch(`/api/runners/${runnerNumber}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });

    if (!res.ok) {
      setStatus((prev) => ({ ...prev, [runnerNumber]: "Error" }));
      return;
    }

    const updated = (await res.json()) as {
      runner_number: number;
      name: string;
      default_estimated_pace_spm: number | null;
    };

    updateRunnerLocal(updated.runner_number, {
      name: updated.name,
      default_estimated_pace_spm: updated.default_estimated_pace_spm
    });
    setStatus((prev) => ({ ...prev, [runnerNumber]: "Saved" }));
    router.refresh();
  }

  return (
    <section className="panel" style={{ display: "grid", gap: "0.8rem" }}>
      <div>
        <h2>Runners</h2>
        <p className="muted">Edit runner names and default paces once here. Changes propagate to all legs.</p>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Runner #</th>
              <th>Name</th>
              <th>Default Pace</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {runners.map((runner) => (
              <tr key={runner.runner_number}>
                <td>{runner.runner_number}</td>
                <td>
                  <input
                    type="text"
                    value={runner.name ?? ""}
                    onChange={(event) => {
                      updateRunnerLocal(runner.runner_number, { name: event.target.value });
                    }}
                    onBlur={(event) => {
                      void saveRunner(runner.runner_number, { name: event.target.value });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        (event.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                  />
                </td>
                <td>
                  <PaceEditor
                    disabled={false}
                    value={runner.default_estimated_pace_spm}
                    onSave={(value) => {
                      updateRunnerLocal(runner.runner_number, {
                        default_estimated_pace_spm: value
                      });
                      void saveRunner(runner.runner_number, {
                        default_estimated_pace_spm: value
                      });
                    }}
                  />
                </td>
                <td className="muted">{status[runner.runner_number] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
