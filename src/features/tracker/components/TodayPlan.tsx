"use client";
import { useEffect, useState } from "react";
import { Field, Toggle } from "@/components/Fields";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import {
  updateTodayPlan,
  resetTodayPlan,
  savePlanAsDefault,
} from "@/store/appSlice";
import { jobPlan } from "@/features/jobs/model";
import { planChanges } from "../model";
import type { TodayPlan as Plan } from "@/types";
import { money } from "@/features/history/model";

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  const [draft, setDraft] = useState(String(value)),
    [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);
  return (
    <Field
      label={label}
      type="number"
      min={min}
      max={max}
      step="any"
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        const number = Number(draft);
        setFocused(false);
        if (
          draft &&
          Number.isFinite(number) &&
          number >= min &&
          number <= max &&
          number !== value
        )
          onChange(number);
        else setDraft(String(value));
      }}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}
export function TodayPlan() {
  const data = useApp(),
    { read, commit, busy, notify } = useWorkspace(),
    plan = data.todayPlan;
  const job = data.jobs.find(
    (item) => item.id === (data.activeShift?.jobId ?? data.selectedJobId),
  );
  const defaults = job ? jobPlan(job, data.defaultPlan) : data.defaultPlan;
  const currency =
    data.activeShift?.currency ?? job?.currency ?? data.preferences.currency;
  const isDefault = [
    "plannedHours",
    "lunchEnabled",
    "lunchMinutes",
    "hourlyRate",
    "overtimeThreshold",
    "overtimeMultiplier",
    "planningMode",
    "plannedClockOut",
  ].every((key) => plan[key as keyof Plan] === defaults[key as keyof Plan]);
  const change = (changes: Partial<Plan>) => {
    if (!planChanges(read().todayPlan, changes, read().activeShift)) {
      notify("That plan would have invalid hours, lunch or pay settings.");
      return;
    }
    void commit(updateTodayPlan(changes));
  };
  const fmt = (amount: number, code: string) =>
    data.payVisible ? money(amount, code) : "•••••";
  return (
    <fieldset disabled={busy} className="form-stack">
      <h3>Plan by</h3>
      <div className="chips">
        {(["duration", "end-time"] as const).map((mode) => (
          <button
            key={mode}
            aria-pressed={plan.planningMode === mode}
            onClick={() =>
              change({
                planningMode: mode,
                plannedClockOut:
                  mode === "duration" ? null : plan.plannedClockOut,
              })
            }
          >
            {mode === "duration" ? "Duration" : "End time"}
          </button>
        ))}
      </div>
      {plan.planningMode === "duration" ? (
        <>
          <h3>Planned work hours</h3>
          <div className="chips">
            {[6, 7, 8, 9, 10, 12].map((hours) => (
              <button
                key={hours}
                aria-pressed={plan.plannedHours === hours}
                onClick={() => change({ plannedHours: hours })}
              >
                {hours}h
              </button>
            ))}
          </div>
          <NumberField
            label="Custom work hours"
            value={plan.plannedHours}
            min={0.01}
            max={24}
            onChange={(plannedHours) => change({ plannedHours })}
          />
        </>
      ) : (
        <Field
          label="Clock out by"
          type="time"
          value={plan.plannedClockOut ?? ""}
          onChange={(e) => change({ plannedClockOut: e.target.value || null })}
        />
      )}
      <Toggle
        label="Taking lunch today"
        checked={plan.lunchEnabled}
        onChange={(lunchEnabled) => change({ lunchEnabled })}
      />
      {plan.lunchEnabled && (
        <NumberField
          label="Lunch duration (minutes)"
          value={plan.lunchMinutes}
          min={0}
          max={180}
          onChange={(lunchMinutes) => change({ lunchMinutes })}
        />
      )}
      <div className="divider" />
      <h3>Pay overrides</h3>
      <div className="field-grid">
        <NumberField
          label="Hourly rate"
          value={plan.hourlyRate}
          min={0}
          max={1000000}
          onChange={(hourlyRate) => change({ hourlyRate })}
        />
        <NumberField
          label="OT after (hrs)"
          value={plan.overtimeThreshold}
          min={0.01}
          max={24}
          onChange={(overtimeThreshold) => change({ overtimeThreshold })}
        />
        <NumberField
          label="OT multiplier"
          value={plan.overtimeMultiplier}
          min={1}
          max={4}
          onChange={(overtimeMultiplier) => change({ overtimeMultiplier })}
        />
      </div>
      <div className="divider" />
      <h3>Plan defaults</h3>
      <div className="actions">
        <button
          disabled={currency !== data.preferences.currency}
          onClick={() =>
            void commit(savePlanAsDefault()).then((saved) => {
              if (saved)
                notify(
                  "Global defaults saved. Job-specific overrides still take priority.",
                );
            })
          }
        >
          Save global defaults
        </button>
        <button
          disabled={isDefault}
          onClick={() => void commit(resetTodayPlan())}
        >
          Reset to default
        </button>
      </div>
      <small>
        Reset: {defaults.plannedHours}h work ·{" "}
        {defaults.lunchEnabled ? `${defaults.lunchMinutes}m lunch` : "no lunch"}{" "}
        · {fmt(defaults.hourlyRate, currency)}/hr. Reset uses global hours and
        this job's overrides.
      </small>
      {currency !== data.preferences.currency && (
        <small>
          Global defaults use {data.preferences.currency}; this job uses{" "}
          {currency}. Saving a global rate is unavailable to avoid mixing
          currencies.
        </small>
      )}
    </fieldset>
  );
}
