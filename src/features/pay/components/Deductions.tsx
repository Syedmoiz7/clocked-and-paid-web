"use client";
import { useState } from "react";
import { Toggle } from "@/components/Fields";
import type { AppState, Deduction } from "@/types";
import { localDate, money } from "@/features/history/model";
import {
  daysBetween,
  deductionCurrencyMatches,
  financialSummary,
  projectedDeductions,
  type Bounds,
} from "../model";
import { usePayActions } from "../usePayActions";
import { DeductionForm } from "./DeductionForm";
import { Confirm } from "./Shared";

export function Deductions({
  data,
  jobId,
  currency,
  bounds,
  busy,
}: {
  data: AppState;
  jobId: string | null;
  currency: string;
  bounds: Bounds;
  busy: boolean;
}) {
  const actions = usePayActions(),
    [form, setForm] = useState<{ initial?: Deduction } | null>(null),
    [remove, setRemove] = useState<Deduction | null>(null),
    [examples, setExamples] = useState(false);
  const visible = data.deductions.filter(
    (item) =>
      (!jobId || !item.jobId || item.jobId === jobId) &&
      deductionCurrencyMatches(item, data, currency),
  );
  const summary = financialSummary(data, bounds, jobId, currency),
    factor = 365 / Math.max(1, daysBetween(bounds.start, bounds.end) + 1);
  const projection = projectedDeductions(
    { ...data, deductions: visible },
    jobId,
    summary.gross * factor,
    localDate(),
    new Map(summary.rows.map((row) => [row.jobId, row.gross * factor])),
  );
  const fmt = (value: number) =>
    data.payVisible ? money(value, currency) : "•••••";
  return (
    <div className="pay-deductions">
      <div className="pay-row">
        <h3>Taxes & Deductions</h3>
        <button disabled={busy} onClick={() => setForm({})}>
          + Add deduction
        </button>
      </div>
      <p>
        Projected monthly: {fmt(projection.monthly)} · Annual:{" "}
        {fmt(projection.annual)}
      </p>
      <p>
        Percentage projections use annualized earnings from the selected range.
        One-time rules are excluded. Pre-tax labels describe the rule; no tax
        bracket calculation is performed.
      </p>
      {!visible.length && (
        <div className="pay-notice">
          <h4>Get accurate take-home estimates</h4>
          <p>
            Add taxes, insurance, retirement contributions, or other deductions.
          </p>
          {!jobId && currency === data.preferences.currency && (
            <button disabled={busy} onClick={() => setExamples(true)}>
              Add Common Tax Defaults
            </button>
          )}
        </div>
      )}
      <div className="deduction-grid">
        {visible.map((item) => (
          <article key={item.id} className="paycheck-card">
            <div className="pay-row">
              <h4>{item.label}</h4>
              <span className="pay-badge">
                {item.isPercentage
                  ? data.payVisible
                    ? `${item.amount}%`
                    : "•••%"
                  : fmt(item.amount)}
              </span>
            </div>
            <p>
              {item.frequency.replaceAll("-", " ")} ·{" "}
              {data.jobs.find((job) => job.id === item.jobId)?.name ??
                "All jobs"}
              {item.beforeTax ? " · Pre-tax" : ""}
              {item.taxSetAside ? " · Tax set-aside" : ""}
            </p>
            <p>
              {item.applicableFromDate ?? "Any start"} →{" "}
              {item.applicableToDate ?? "Any end"}
              {item.payDate ? ` · Received ${item.payDate}` : ""}
            </p>
            {item.consumedByPaycheckId && (
              <p className="warning">Applied to a received paycheck</p>
            )}
            {item.notes && <p className="preserve-lines">{item.notes}</p>}
            <Toggle
              label={`Enable ${item.label}`}
              checked={item.enabled}
              disabled={busy}
              onChange={(enabled) =>
                void actions.deduction({ ...item, enabled }, item)
              }
            />
            <div className="button-row">
              <button
                disabled={busy}
                onClick={() => setForm({ initial: item })}
              >
                Edit deduction
              </button>
              <button disabled={busy} onClick={() => setRemove(item)}>
                Delete deduction
              </button>
            </div>
          </article>
        ))}
      </div>
      {form && (
        <DeductionForm
          data={data}
          initial={form.initial}
          jobId={jobId}
          bounds={bounds}
          onSave={(value) => actions.deduction(value, form.initial)}
          onClose={() => setForm(null)}
        />
      )}
      {remove && (
        <Confirm
          title="Delete deduction?"
          label="Delete deduction"
          action={() => actions.removeDeduction(remove)}
          onClose={() => setRemove(null)}
        >
          <p>
            Delete {remove.label}? Existing received-paycheck amounts stay
            unchanged.
          </p>
        </Confirm>
      )}
      {examples && (
        <Confirm
          title="Add example deductions?"
          label="Add examples"
          action={actions.examples}
          onClose={() => setExamples(false)}
        >
          <p>
            These are the client app’s sample amounts. Edit them to match your
            own payslip; they are not calculated tax rates.
          </p>
        </Confirm>
      )}
    </div>
  );
}
