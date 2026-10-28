"use client";
import { useState } from "react";
import type { AppState, MockPaycheck, PaySchedule } from "@/types";
import { localDate, money, selectable } from "@/features/history/model";
import { addDays, payPeriod } from "@/features/history/payPeriods";
import {
  paycheckDraft,
  payViewSchedule,
  scheduleFor,
  type Bounds,
} from "../model";
import { usePayActions } from "../usePayActions";
import { ReceiptForm } from "./ReceiptForm";
import { ScheduleForm } from "./ScheduleForm";
import { Confirm, Metric } from "./Shared";

type Confirmation = {
  title: string;
  text: string;
  label: string;
  action: () => Promise<string | null>;
};
export function Paychecks({
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
  const actions = usePayActions();
  const jobs = data.jobs.filter(
    (job) =>
      (!jobId || job.id === jobId) &&
      (job.currency ?? data.preferences.currency) === currency,
  );
  const [manualJob, setManualJob] = useState(""),
    [receipt, setReceipt] = useState<{ jobId: string; bounds: Bounds } | null>(
      null,
    ),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [setup, setSetup] = useState<{
    id: string;
    initial: PaySchedule;
    original?: PaySchedule;
  } | null>(null);
  const chosenJob = jobs.some((job) => job.id === manualJob)
    ? manualJob
    : (jobs.find((job) => !job.archived)?.id ?? jobs[0]?.id ?? "");
  const scheduled = jobs.filter(
    (job) => !job.archived && job.payFrequency && job.payPeriodStart,
  );
  const fmt = (value: number) =>
    data.payVisible ? money(value, currency) : "•••••";
  const receipts = data.paychecks.filter(
    (record) =>
      record.paid &&
      (!jobId || record.jobId === jobId) &&
      (record.currency ??
        data.jobs.find((job) => job.id === record.jobId)?.currency ??
        data.preferences.currency) === currency &&
      record.startDate <= bounds.end &&
      record.endDate >= bounds.start,
  );
  return (
    <>
      <p>
        Scheduled cards show current and previous periods for the selected
        job/currency. Received paychecks below follow the selected dates.
      </p>
      {!jobs.length && (
        <p>
          No jobs match this currency. Choose another currency to manage its
          paychecks.
        </p>
      )}
      {jobs
        .filter(
          (job) => !job.archived && (!job.payFrequency || !job.payPeriodStart),
        )
        .map((job) => (
          <div className="pay-notice" key={job.id}>
            <p>
              Set a pay schedule for {job.name} to see current and overdue
              paychecks.
            </p>
            <button
              disabled={busy}
              onClick={() =>
                setSetup({
                  id: job.id,
                  initial:
                    payViewSchedule(data, job.id) ??
                    scheduleFor("biweekly", localDate()),
                  original: data.paySchedules[job.id],
                })
              }
            >
              Set up {job.name}
            </button>
          </div>
        ))}
      <div className="paycheck-grid">
        {scheduled.flatMap((job) => {
          const current = payPeriod(localDate(), job);
          if (!current) return [];
          const previous = payPeriod(addDays(current.start, -1), job);
          return [previous, current].flatMap((period, index) => {
            if (!period) return [];
            const received = data.paychecks.find(
              (record) =>
                record.jobId === job.id &&
                (record.currency ??
                  job.currency ??
                  data.preferences.currency) === currency &&
                record.startDate === period.start &&
                record.endDate === period.end &&
                record.paid,
            );
            if (index === 0 && received) return [];
            const calculated = paycheckDraft(data, job.id, period, currency),
              unpaid = calculated.entries.filter((entry) =>
                selectable(entry, data.paychecks, data.jobs),
              ),
              expected = addDays(period.end, job.payDelayDays ?? 7);
            return (
              <article
                className="paycheck-card"
                key={`${job.id}-${period.start}`}
              >
                <div className="pay-row">
                  <h3>{job.name}</h3>
                  <span
                    className={`pay-badge ${received ? "positive" : expected < localDate() ? "warning" : ""}`}
                  >
                    {received
                      ? "Received"
                      : expected < localDate()
                        ? "Overdue"
                        : index === 0
                          ? "Previous period"
                          : "In progress"}
                  </span>
                </div>
                <p>
                  {period.start} → {period.end}
                </p>
                <p>Expected pay date: {expected}</p>
                <p>
                  {calculated.entries.length} shifts ·{" "}
                  {calculated.hours.toFixed(1)}h · {unpaid.length} unpaid
                </p>
                <div className="pay-metrics">
                  <Metric
                    label={received ? "Gross" : "Est. gross"}
                    value={fmt(received?.grossPay ?? calculated.gross)}
                  />
                  <Metric
                    label="Deductions"
                    value={fmt(
                      received?.totalDeductions ?? calculated.deductions,
                    )}
                  />
                  <Metric
                    accent
                    label="Net"
                    value={fmt(
                      received?.netPay ??
                        Math.max(0, calculated.gross - calculated.deductions),
                    )}
                  />
                </div>
                {!received && (
                  <>
                    <p>{calculated.estimate.label}</p>
                    <div className="button-row">
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          setReceipt({ jobId: job.id, bounds: period })
                        }
                      >
                        Mark paycheck received
                      </button>
                      <button
                        disabled={busy || !unpaid.length}
                        onClick={() =>
                          setConfirmation({
                            title: "Mark these shifts paid?",
                            text: "This updates payment status without creating a received paycheck.",
                            label: "Mark paid",
                            action: () =>
                              actions.markPaid(unpaid.map((entry) => entry.id)),
                          })
                        }
                      >
                        Quick mark unpaid shifts as paid
                      </button>
                    </div>
                  </>
                )}
              </article>
            );
          });
        })}
      </div>
      <div className="pay-row pay-record">
        <label className="field">
          <span>Receipt job</span>
          <select
            value={chosenJob}
            onChange={(event) => setManualJob(event.target.value)}
            disabled={!jobs.length}
          >
            {!jobs.length && <option value="">No matching job</option>}
            {jobs.map((job) => (
              <option value={job.id} key={job.id}>
                {job.name}
                {job.archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !chosenJob}
          onClick={() => setReceipt({ jobId: chosenJob, bounds })}
        >
          Record a received paycheck
        </button>
      </div>
      <h3>Received Paychecks</h3>
      {!receipts.length && (
        <p>No received paychecks match these dates, job and currency.</p>
      )}
      <div className="paycheck-grid">
        {[...receipts]
          .sort((a, b) => (b.payDate ?? "").localeCompare(a.payDate ?? ""))
          .map((record) => (
            <article className="paycheck-card" key={record.id}>
              <div className="pay-row">
                <h3>
                  {data.jobs.find((job) => job.id === record.jobId)?.name ??
                    "Removed job"}
                </h3>
                <span className="pay-badge positive">Received</span>
              </div>
              <p>
                {record.startDate} → {record.endDate} · Received{" "}
                {record.payDate ?? "—"}
              </p>
              <div className="pay-metrics">
                <Metric
                  label="Actual gross"
                  value={fmt(record.grossPay ?? 0)}
                />
                <Metric
                  label="Actual deductions"
                  value={fmt(record.totalDeductions ?? 0)}
                />
                <Metric
                  accent
                  label="Actual net"
                  value={fmt(record.netPay ?? 0)}
                />
              </div>
              {record.notes && <p className="preserve-lines">{record.notes}</p>}
              <button
                disabled={busy}
                onClick={() =>
                  setConfirmation({
                    title: "Undo paycheck?",
                    text: "This removes the receipt, releases its one-time deductions, and restores unpaid status only for shifts marked by this receipt. Earlier manual payments stay paid.",
                    label: "Undo paycheck",
                    action: () => actions.undo(record),
                  })
                }
              >
                Undo received paycheck
              </button>
            </article>
          ))}
      </div>
      {receipt && (
        <ReceiptForm
          data={data}
          jobId={receipt.jobId}
          currency={currency}
          initialBounds={receipt.bounds}
          onSave={actions.receipt}
          onClose={() => setReceipt(null)}
        />
      )}
      {setup && (
        <ScheduleForm
          initial={setup.initial}
          jobId={setup.id}
          onClose={() => setSetup(null)}
          onSave={(schedule, apply) =>
            actions.schedule(setup.id, schedule, apply, setup.original)
          }
        />
      )}
      {confirmation && (
        <Confirm
          title={confirmation.title}
          label={confirmation.label}
          action={confirmation.action}
          onClose={() => setConfirmation(null)}
        >
          <p>{confirmation.text}</p>
        </Confirm>
      )}
    </>
  );
}
