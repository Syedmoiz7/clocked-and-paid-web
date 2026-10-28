"use client";
import { useState } from "react";
import { Field, Modal } from "@/components/Fields";
import type { AppState, MockPaycheck } from "@/types";
import { localDate, money } from "@/features/history/model";
import {
  paycheckDraft,
  validateReceipt,
  validBounds,
  type Bounds,
} from "../model";
import { FormFooter, usePayForm } from "./Shared";

export function ReceiptForm({
  data,
  jobId,
  currency,
  initialBounds,
  onSave,
  onClose,
}: {
  data: AppState;
  jobId: string;
  currency: string;
  initialBounds: Bounds;
  onSave: (record: MockPaycheck) => Promise<string | null>;
  onClose: () => void;
}) {
  const [bounds, setBounds] = useState(initialBounds),
    [date, setDate] = useState(localDate),
    [gross, setGross] = useState(""),
    [deductions, setDeductions] = useState(""),
    [notes, setNotes] = useState("");
  const [id] = useState(() => crypto.randomUUID());
  const estimate = paycheckDraft(data, jobId, bounds, currency);
  const changeBounds = (value: Bounds) => {
    if (value.start === bounds.start && value.end === bounds.end) return;
    setBounds(value);
    setGross("");
    setDeductions("");
  };
  const form = usePayForm(async () => {
    const record: MockPaycheck = {
      id,
      jobId,
      startDate: bounds.start,
      endDate: bounds.end,
      paid: true,
      payDate: date,
      grossPay: gross.trim() ? Number(gross) : NaN,
      totalDeductions: deductions.trim() ? Number(deductions) : NaN,
      netPay: Number(gross) - Number(deductions),
      notes: notes.trim(),
      currency,
      createdAt: new Date().toISOString(),
    };
    return validateReceipt(record, localDate()) ?? onSave(record);
  }, onClose);
  const validAmounts =
    gross.trim() &&
    deductions.trim() &&
    Number.isFinite(Number(gross)) &&
    Number.isFinite(Number(deductions)) &&
    Number(gross) >= 0 &&
    Number(deductions) >= 0 &&
    Number(deductions) <= Number(gross);
  return (
    <Modal title="Received paycheck" onClose={onClose} busy={form.saving}>
      <form onSubmit={form.submit} noValidate>
        <fieldset disabled={form.saving}>
          <p>
            {data.jobs.find((job) => job.id === jobId)?.name} · {currency}
          </p>
          <div className="field-grid">
            <Field
              label="Period start"
              type="date"
              value={bounds.start}
              onChange={(event) =>
                changeBounds({ ...bounds, start: event.target.value })
              }
            />
            <Field
              label="Period end"
              type="date"
              value={bounds.end}
              onChange={(event) =>
                changeBounds({ ...bounds, end: event.target.value })
              }
            />
          </div>
          <p>
            {estimate.entries.length} completed shifts · Tracked gross{" "}
            {data.payVisible ? money(estimate.gross, currency) : "•••••"}. Enter
            your payslip amounts; copied values are estimates. Changing dates
            clears the amount inputs.
          </p>
          <button
            type="button"
            disabled={!validBounds(bounds)}
            onClick={() => {
              setGross(estimate.gross.toFixed(2));
              setDeductions(estimate.deductions.toFixed(2));
            }}
          >
            Copy tracked estimate into actual amounts
          </button>
          <Field
            label="Received on"
            type="date"
            max={localDate()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <div className="field-grid">
            <Field
              label="Actual gross pay"
              type="number"
              step="any"
              value={gross}
              onChange={(event) => setGross(event.target.value)}
            />
            <Field
              label="Actual deductions"
              type="number"
              step="any"
              value={deductions}
              onChange={(event) => setDeductions(event.target.value)}
            />
          </div>
          <p className="pay-net">
            Net pay:{" "}
            {validAmounts
              ? data.payVisible
                ? money(Number(gross) - Number(deductions), currency)
                : "•••••"
              : "—"}
          </p>
          <label className="field">
            <span>Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <p>
            Saving marks covered completed shifts as paid. Undo restores only
            payments made by this receipt and preserves earlier manual payments.
          </p>
        </fieldset>
        <FormFooter
          {...form}
          label="Confirm received paycheck"
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}
