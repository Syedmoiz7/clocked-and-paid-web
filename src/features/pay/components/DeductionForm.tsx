"use client";
import { useState } from "react";
import { Field, Modal, Toggle } from "@/components/Fields";
import type { AppState, Deduction } from "@/types";
import { money } from "@/features/history/model";
import {
  periodEntries,
  shiftAmounts,
  validateDeduction,
  type Bounds,
} from "../model";
import { FormFooter, usePayForm } from "./Shared";

const frequencies: Deduction["frequency"][] = [
  "daily",
  "weekly",
  "per-pay-period",
  "monthly",
  "yearly",
  "one-time",
];
export function DeductionForm({
  data,
  initial,
  jobId,
  bounds,
  onSave,
  onClose,
}: {
  data: AppState;
  initial?: Deduction;
  jobId: string | null;
  bounds: Bounds;
  onSave: (deduction: Deduction) => Promise<string | null>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Deduction>(
      () =>
        initial ?? {
          id: crypto.randomUUID(),
          label: "",
          amount: 0,
          frequency: "monthly",
          enabled: true,
          jobId,
        },
    ),
    [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const update = (changes: Partial<Deduction>) =>
    setDraft((current) => ({ ...current, ...changes }));
  const currency =
    (!draft.isPercentage ? draft.currency : undefined) ??
    data.jobs.find((job) => job.id === draft.jobId)?.currency ??
    data.preferences.currency;
  const entries = periodEntries(
    data,
    {
      start: draft.applicableFromDate ?? bounds.start,
      end: draft.applicableToDate ?? bounds.end,
    },
    draft.jobId ?? null,
    currency,
    true,
  );
  const gross = entries.reduce(
    (sum, entry) => sum + shiftAmounts(entry, data).gross,
    0,
  );
  const form = usePayForm(async () => {
    const value = {
      ...draft,
      label: draft.label.trim(),
      amount: amount.trim() ? Number(amount) : NaN,
      currency: draft.isPercentage ? undefined : currency,
    };
    return validateDeduction(value) ?? onSave(value);
  }, onClose);
  const mode = (percentage: boolean) => {
    if (percentage !== Boolean(draft.isPercentage)) {
      setAmount("");
      update({ isPercentage: percentage });
    }
  };
  return (
    <Modal
      title={initial ? "Edit deduction" : "Add deduction"}
      onClose={onClose}
      busy={form.saving}
    >
      <form onSubmit={form.submit} noValidate>
        <fieldset disabled={form.saving}>
          <Field
            label="Name"
            value={draft.label}
            onChange={(event) => update({ label: event.target.value })}
          />
          <div className="chips" aria-label="Deduction type">
            <button
              type="button"
              aria-pressed={!draft.isPercentage}
              onClick={() => mode(false)}
            >
              Flat amount
            </button>
            <button
              type="button"
              aria-pressed={Boolean(draft.isPercentage)}
              onClick={() => mode(true)}
            >
              Percentage
            </button>
          </div>
          <Field
            label={
              draft.isPercentage ? "Percentage (%)" : `Amount (${currency})`
            }
            type="number"
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <p>
            Changing the amount type clears the input.{" "}
            {draft.isPercentage
              ? "Percentage applies once to gross in this rule’s job/date scope."
              : `Flat amounts use ${currency}. Global flat amounts use your default currency.`}
          </p>
          <p>
            {data.payVisible
              ? `Reference gross ${money(gross, currency)}${draft.isPercentage ? ` · Percentage amount ${money((gross * (Number(amount) || 0)) / 100, currency)}` : ""}`
              : "Period amounts hidden"}{" "}
            · {entries.length} completed shifts
          </p>
          <label className="field">
            <span>Frequency</span>
            <select
              value={
                draft.isPercentage
                  ? draft.frequency === "one-time"
                    ? "one-time"
                    : "monthly"
                  : draft.frequency
              }
              onChange={(event) =>
                update({
                  frequency: event.target.value as Deduction["frequency"],
                })
              }
            >
              {(draft.isPercentage ? ["monthly", "one-time"] : frequencies).map(
                (value) => (
                  <option key={value} value={value}>
                    {draft.isPercentage
                      ? value === "one-time"
                        ? "One-time percentage"
                        : "Ongoing percentage"
                      : value.replaceAll("-", " ")}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="field">
            <span>Deduction job</span>
            <select
              value={draft.jobId ?? ""}
              onChange={(event) => {
                const jobId = event.target.value || null,
                  nextCurrency =
                    data.jobs.find((job) => job.id === jobId)?.currency ??
                    data.preferences.currency;
                if (!draft.isPercentage && nextCurrency !== currency)
                  setAmount("");
                update({
                  jobId,
                  currency: draft.isPercentage ? undefined : nextCurrency,
                });
              }}
            >
              <option value="">All jobs</option>
              {data.jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.name}
                  {job.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
          <Toggle
            label="Enabled"
            checked={draft.enabled}
            onChange={(enabled) => update({ enabled })}
          />
          <Toggle
            label="Pre-tax deduction"
            checked={Boolean(draft.beforeTax)}
            onChange={(beforeTax) => update({ beforeTax })}
          />
          <Toggle
            label="Tax set-aside"
            checked={Boolean(draft.taxSetAside)}
            onChange={(taxSetAside) => update({ taxSetAside })}
          />
          <p>
            Pre-tax is a descriptive label; it does not calculate tax brackets.
            A tax set-aside is deducted from take-home separately.
          </p>
          <div className="field-grid">
            {(
              [
                ["Applicable from", "applicableFromDate"],
                ["Applicable to", "applicableToDate"],
                ["Payment received date", "payDate"],
              ] as const
            ).map(([label, key]) => (
              <Field
                key={key}
                label={label}
                type="date"
                value={draft[key] ?? ""}
                onChange={(event) =>
                  update({ [key]: event.target.value || undefined })
                }
              />
            ))}
          </div>
          <label className="field">
            <span>Notes</span>
            <textarea
              value={draft.notes ?? ""}
              onChange={(event) => update({ notes: event.target.value })}
            />
          </label>
          {draft.frequency === "one-time" && (
            <p>
              Give one-time deductions an applicable date range so they are
              assigned to the correct paycheck.
            </p>
          )}
          {draft.consumedByPaycheckId && (
            <p className="warning">
              Applied to a received paycheck; excluded from future estimates.
            </p>
          )}
        </fieldset>
        <FormFooter {...form} label="Save deduction" onClose={onClose} />
      </form>
    </Modal>
  );
}
