"use client";
import { CalendarRange } from "lucide-react";
import { useState } from "react";
import { Field, Toggle } from "@/components/Fields";
import type { AppState } from "@/types";
import { duration, money } from "@/features/history/model";
import {
  estimateDeductions,
  manualDeduction,
  periodEntries,
  shiftAmounts,
  type Bounds,
} from "../model";
import { Metric } from "./Shared";

export function Estimator({
  data,
  jobId,
  currency,
  bounds,
}: {
  data: AppState;
  jobId: string | null;
  currency: string;
  bounds: Bounds;
}) {
  const [preferConfigured, setPreferConfigured] = useState(false),
    [manual, setManual] = useState(false),
    [type, setType] = useState("amount"),
    [value, setValue] = useState("");
  const entries = periodEntries(data, bounds, jobId, currency, true),
    perJob = new Map<string | null, number>();
  let gross = 0,
    minutes = 0;
  entries.forEach((entry) => {
    const value = shiftAmounts(entry, data);
    gross += value.gross;
    minutes += value.minutes;
    perJob.set(
      entry.jobId ?? null,
      (perJob.get(entry.jobId ?? null) ?? 0) + value.gross,
    );
  });
  const estimate = estimateDeductions(
      data,
      bounds,
      jobId,
      perJob,
      currency,
      preferConfigured,
    ),
    override = manualDeduction(gross, type, value),
    deductions = manual ? override.amount : estimate.total;
  const fmt = (value: number) =>
    data.payVisible ? money(value, currency) : "•••••";
  return (
    <div className="pay-estimator">
      <h3 className="pay-estimator-heading">
        <span className="pay-section-icon" aria-hidden="true">
          <CalendarRange size={16} />
        </span>
        Paycheck Estimator
      </h3>
      <p>
        {bounds.start} → {bounds.end} ·{" "}
        {data.jobs.find((job) => job.id === jobId)?.name ?? "All jobs"} ·{" "}
        {currency}. Uses the filters above and completed shifts only.
      </p>
      <div className="pay-estimator-summary">
        <div className="pay-estimator-net">
          <Metric
            label="Est. net pay"
            value={
              deductions == null ? "—" : fmt(Math.max(0, gross - deductions))
            }
          />
        </div>
        <div className="pay-metrics">
          <Metric label="Gross pay" value={fmt(gross)} />
          <Metric
            label="Est. deductions"
            value={
              deductions == null ? "Enter valid deductions" : fmt(deductions)
            }
          />
          <Metric
            label="Recorded work"
            value={`${duration(minutes)} · ${entries.length} shifts`}
          />
        </div>
      </div>
      <p>
        {manual ? "Manual deduction override" : estimate.label}
        {!manual && estimate.count > 0
          ? ` · Confidence: ${estimate.count >= 8 ? "High" : estimate.count >= 4 ? "Medium" : "Low"}`
          : ""}
      </p>
      {gross > 0 && deductions != null && deductions / gross > 0.4 && (
        <p className="warning">
          Deductions exceed 40% of gross. Check your saved settings and paycheck
          history.
        </p>
      )}
      {!manual && (
        <Toggle
          label="Prefer saved deductions over paycheck history"
          checked={preferConfigured}
          onChange={setPreferConfigured}
        />
      )}
      <Toggle
        label="Override deductions manually"
        checked={manual}
        onChange={setManual}
      />
      {manual && (
        <>
          <div className="chips">
            {["amount", "percent"].map((item) => (
              <button
                key={item}
                aria-pressed={type === item}
                onClick={() => {
                  if (type !== item) {
                    setType(item);
                    setValue("");
                  }
                }}
              >
                {item === "amount" ? "Amount" : "Percentage"}
              </button>
            ))}
          </div>
          <Field
            label={
              type === "amount" ? "Deduction amount" : "Deduction percentage"
            }
            type="number"
            step="any"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          {override.error && (
            <p className="error" role="alert">
              {override.error}
            </p>
          )}
        </>
      )}
      {!manual && estimate.lineItems.length > 0 && (
        <ul className="pay-lines">
          {estimate.lineItems.map((item) => (
            <li key={item.id}>
              <span>{item.label}</span>
              <strong>{fmt(item.amount)}</strong>
            </li>
          ))}
        </ul>
      )}
      {!entries.length && (
        <p>
          No completed shifts in this period. Add or complete a shift in Tracker
          or History to see an estimate.
        </p>
      )}
      <p>
        Cash/card/other tips are paid separately and excluded from paycheck
        gross. Estimates never modify recorded shifts.
      </p>
    </div>
  );
}
