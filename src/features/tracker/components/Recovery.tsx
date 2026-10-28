"use client";
import { useState } from "react";
import { Field } from "@/components/Fields";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import { prepareRecovery, recoveryEndAt, formatDuration } from "../model";
import { resolveOrphanedShift, discardOrphanedShift } from "@/store/appSlice";
import {
  localDate,
  timeValue,
  money,
  workedMinutes,
} from "@/features/history/model";
export function Recovery() {
  const data = useApp(),
    { read, commit, busy, notify } = useWorkspace();
  const source = data.orphanedShift!;
  const [date, setDate] = useState(source.date),
    [time, setTime] = useState("");
  const endedAt = recoveryEndAt(date, time),
    result = endedAt ? prepareRecovery(source, endedAt, data) : null;
  const save = async () => {
    const latest = read();
    if (!endedAt || latest.orphanedShift?.id !== source.id) return;
    const prepared = prepareRecovery(latest.orphanedShift, endedAt, latest);
    if ("error" in prepared) {
      notify(prepared.error);
      return;
    }
    await commit(resolveOrphanedShift(prepared.entry));
  };
  return (
    <section className="card recovery form-stack">
      <h2>Unfinished shift</h2>
      <p>
        Clocked in {source.date} at {timeValue(source.startedAt)}. Choose when
        you actually finished before saving.
      </p>
      <div className="field-grid">
        <Field
          label="Actual clock-out date"
          type="date"
          value={date}
          disabled={busy}
          onChange={(e) => setDate(e.target.value)}
        />
        <Field
          label="Actual clock-out time"
          type="time"
          value={time}
          disabled={busy}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>
      {result &&
        ("error" in result ? (
          <p className="error">{result.error}</p>
        ) : (
          <p>
            {formatDuration(workedMinutes(result.entry) * 60)} worked ·{" "}
            {data.payVisible
              ? money(
                  result.entry.earnings,
                  result.entry.currency ?? data.preferences.currency,
                )
              : "•••••"}{" "}
            gross
          </p>
        ))}
      <div className="actions">
        <button
          disabled={busy || !result || "error" in result}
          className="primary"
          onClick={() => void save()}
        >
          Save completed shift
        </button>
        <button
          disabled={busy}
          onClick={() => {
            const now = new Date();
            setDate(localDate(now));
            setTime(timeValue(now.toISOString()));
          }}
        >
          Use current date and time
        </button>
        <button
          disabled={busy}
          className="danger"
          onClick={() => {
            if (
              window.confirm(
                "Discard this unfinished shift? Its unsaved work will be removed.",
              )
            )
              void commit(discardOrphanedShift());
          }}
        >
          Discard unfinished shift
        </button>
      </div>
    </section>
  );
}
