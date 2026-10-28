"use client";
import { useState } from "react";
import { Field, Toggle } from "@/components/Fields";
import { useWorkspace } from "@/components/WorkspaceProvider";
import {
  manualEntryAction,
  manualShift,
  withPlanRates,
  type ManualTimes,
} from "../model";
import { timeValue, wagesFor } from "@/features/history/model";
import {
  addManualShift,
  clockIn,
  clockOut,
  updateActiveShift,
  updateHistoryShift,
} from "@/store/appSlice";
import { localDate } from "@/utils/dateOnly";
import type { Shift } from "@/types";

export function newShift(jobId: string, currency: string): Shift {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    date: localDate(new Date(now)),
    startedAt: now,
    endedAt: null,
    lunchMinutes: 0,
    breakMinutes: 0,
    earnings: 0,
    jobId,
    currency,
  };
}
export function ManualTimesForm({
  shift,
  editing = false,
  onSaved,
}: {
  shift: Shift | null;
  editing?: boolean;
  onSaved?: () => void;
}) {
  const { read, commit, busy } = useWorkspace();
  const [times, setTimes] = useState<ManualTimes>({
    start: timeValue(shift?.startedAt),
    end: timeValue(shift?.endedAt),
    lunchStart: timeValue(shift?.lunchStartedAt ?? shift?.historyLunchStart),
    lunchEnd: timeValue(shift?.historyLunchEnd),
  });
  const [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  const action = manualEntryAction(shift, times, editing);
  const update = (field: keyof ManualTimes, value: string | boolean) => {
    setTimes((old) => ({
      ...old,
      [field]: value,
      ...(field === "lunchStart" || field === "lunchEnd"
        ? { clearLunch: false }
        : {}),
    }));
    setError("");
    setSaved("");
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSaved("");
    const data = read();
    const existing = editing
      ? data.history.find((item) => item.id === shift?.id)
      : data.activeShift;
    if (editing && !existing) {
      setError("This entry is no longer available.");
      return;
    }
    const job = data.jobs.find(
      (item) => item.id === (existing?.jobId ?? data.selectedJobId),
    );
    if (!existing && (!job || job.archived || data.orphanedShift)) {
      setError(
        "Choose an available job and resolve any unfinished shift first.",
      );
      return;
    }
    if (
      !existing &&
      !times.end &&
      data.extraShifts.some((item) => item.jobId === job?.id)
    ) {
      setError("This job already has a running shift.");
      return;
    }
    const result = manualShift(
      existing ?? newShift(job!.id, job!.currency ?? data.preferences.currency),
      times,
    );
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const entry = editing
      ? result.shift
      : withPlanRates(result.shift, data.todayPlan);
    entry.earnings = wagesFor(entry, data.jobs, data.defaultPlan, Date.now());
    const next = editing
      ? updateHistoryShift({ id: entry.id, changes: entry })
      : entry.endedAt
        ? existing
          ? clockOut(entry)
          : addManualShift(entry)
        : existing
          ? updateActiveShift(entry)
          : clockIn(entry);
    if (await commit(next)) {
      setSaved("Times saved.");
      if (!editing && entry.endedAt)
        setTimes({ start: "", end: "", lunchStart: "", lunchEnd: "" });
      onSaved?.();
    }
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="form-stack">
      <fieldset disabled={busy} className="form-stack">
        <p>{action.hint}</p>
        <div className="field-grid">
          {(
            [
              ["start", "Clock in"],
              ["lunchStart", "Lunch start"],
              ["lunchEnd", "Lunch end"],
              ["end", "Clock out"],
            ] as const
          ).map(([key, label]) => (
            <Field
              key={key}
              type="time"
              label={label}
              value={times[key]}
              required={key === "start" || (editing && key === "end")}
              onChange={(event) => update(key, event.target.value)}
            />
          ))}
        </div>
        {shift && (
          <Toggle
            label="Remove recorded lunch"
            checked={Boolean(times.clearLunch)}
            onChange={(checked) => {
              setTimes((old) => ({
                ...old,
                clearLunch: checked,
                ...(checked ? { lunchStart: "", lunchEnd: "" } : {}),
              }));
            }}
          />
        )}
        <small>
          Overnight clock-out times belong to the next day. Recorded breaks are
          preserved.
        </small>
        {error && (
          <p role="alert" className="feedback error">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="feedback">
            {saved}
          </p>
        )}
        <div className="actions">
          <button className="primary" type="submit">
            {busy ? "Saving…" : action.title}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
