"use client";
import { useState } from "react";
import Link from "next/link";
import { Calculator as CalculatorIcon, Sparkles } from "lucide-react";
import { Field, Toggle } from "@/components/Fields";
import { useApp } from "@/components/WorkspaceProvider";
import { calculateHours } from "../model";
import {
  calculatorDefaults,
  calculatorHourOptions,
  calculatorPay,
  selectCalculatorHours,
  selectCalculatorTime,
} from "../calculatorLogic";
import { money, timeValue } from "@/features/history/model";
export function Calculator() {
  const data = useApp();
  const [draft, setDraft] = useState(() =>
      calculatorDefaults(data.defaultPlan),
    ),
    [scope, setScope] = useState("");
  const result = calculateHours(draft);
  const pay =
    "error" in result
      ? null
      : calculatorPay(
          result.hours,
          data.defaultPlan,
          data.jobs,
          data.deductions,
          data.preferences.currency,
          scope || null,
        );
  const fmt = (amount: number) =>
    data.payVisible
      ? money(amount, pay?.currency ?? data.preferences.currency)
      : "•••••";
  if (!data.isPremium)
    return (
      <div className="paywall">
        <Sparkles size={28} />
        <h3>Hours Calculator is part of Premium</h3>
        <p>
          Explore hypothetical work hours and pay without changing a recorded
          shift.
        </p>
        <Link className="button-link primary" href="/plans">
          See plans
        </Link>
      </div>
    );
  return (
    <div className="form-stack">
      <p>
        Choose start and end times, or paid work hours. Only one input method
        contributes to the calculation.
      </p>
      <div className="field-grid">
        <Field
          label="Start time"
          type="time"
          value={draft.start}
          onChange={(e) =>
            setDraft((old) =>
              selectCalculatorTime(old, "start", e.target.value),
            )
          }
        />
        <Field
          label="End time"
          type="time"
          value={draft.end}
          onChange={(e) =>
            setDraft((old) => selectCalculatorTime(old, "end", e.target.value))
          }
        />
      </div>
      {data.activeShift && (
        <button
          onClick={() =>
            setDraft((old) =>
              selectCalculatorTime(
                old,
                "start",
                timeValue(data.activeShift!.startedAt),
              ),
            )
          }
        >
          Use current shift's clock-in
        </button>
      )}
      <h3>Or choose paid work hours</h3>
      <div className="chips">
        {calculatorHourOptions(data.defaultPlan.plannedHours).map((hours) => (
          <button
            key={hours}
            aria-pressed={
              draft.mode === "hours" && draft.hours === String(hours)
            }
            onClick={() =>
              setDraft((old) => selectCalculatorHours(old, String(hours)))
            }
          >
            {hours}h
          </button>
        ))}
      </div>
      <small>
        {draft.mode === "times"
          ? "Using manual times · hour options are unselected"
          : "Using paid hours · manual times are cleared; lunch is not deducted again"}
      </small>
      {draft.mode === "times" && (
        <>
          <Toggle
            label="Deduct unpaid lunch"
            checked={draft.lunchEnabled}
            onChange={(lunchEnabled) =>
              setDraft((old) => ({ ...old, lunchEnabled }))
            }
          />
          {draft.lunchEnabled && (
            <Field
              label="Lunch duration (minutes)"
              type="number"
              min="0"
              max="180"
              value={draft.lunchMinutes}
              onChange={(e) =>
                setDraft((old) => ({ ...old, lunchMinutes: e.target.value }))
              }
            />
          )}
        </>
      )}
      <label className="field">
        <span>Pay profile</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">Global defaults</option>
          {data.jobs
            .filter((job) => !job.archived)
            .map((job) => (
              <option key={job.id} value={job.id}>
                {job.name}
              </option>
            ))}
        </select>
      </label>
      {"error" in result ? (
        <p role="status" className="error">
          {result.error}
        </p>
      ) : (
        <div className="notice" role="status">
          <h3>
            <CalculatorIcon size={16} /> {Math.floor(result.workMinutes / 60)}h{" "}
            {result.workMinutes % 60}m paid work
            {result.dayOffset ? " · ends next day" : ""}
          </h3>
          <div className="stats">
            <div>
              <small>Gross pay</small>
              <strong>{fmt(pay!.gross)}</strong>
            </div>
            <div>
              <small>Daily deductions</small>
              <strong>{fmt(pay!.deductions)}</strong>
            </div>
            <div>
              <small>Estimated net</small>
              <strong>{fmt(pay!.net)}</strong>
            </div>
          </div>
        </div>
      )}
      <small>
        Estimate only. This calculator does not change your shift or Today's
        Plan.
      </small>
      <button
        onClick={() => {
          setDraft(calculatorDefaults(data.defaultPlan));
          setScope("");
        }}
      >
        Reset calculator to defaults
      </button>
    </div>
  );
}
