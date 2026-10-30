"use client";
import Link from "next/link";
import type { AppState } from "@/types";
import { duration, money } from "@/features/history/model";
import { financialSummary, type Bounds } from "../model";
import { Metric } from "./Shared";

export function FinancialSummary({
  data,
  bounds,
  jobId,
  currency,
  now,
}: {
  data: AppState;
  bounds: Bounds;
  jobId: string | null;
  currency: string;
  now: number;
}) {
  const summary = financialSummary(data, bounds, jobId, currency, now),
    fmt = (value: number) =>
      data.payVisible ? money(value, currency) : "•••••";
  return (
    <section
      className="card pay-summary"
      data-testid="pay-summary"
      aria-label="Financial totals"
    >
      <div className="pay-summary-hero">
        <p className="eyebrow">Financial Summary</p>
        <strong className="pay-takehome">{fmt(summary.takeHome)}</strong>
        <div className="pay-row">
          <p>Take-home estimate</p>
          {summary.live && (
            <span className="pay-badge positive">Live pay accruing</span>
          )}
        </div>
        <p>
          {summary.count} {summary.count === 1 ? "entry" : "entries"} ·{" "}
          {duration(summary.minutes)}
          {summary.liveCount
            ? ` · Includes ${summary.liveCount} running shift(s)`
            : ""}
        </p>
      </div>
      <div className="pay-metrics pay-summary-primary">
        <Metric
          label="Tracked gross (paycheck tips included)"
          value={fmt(summary.gross)}
        />
        <Metric label="Net pay" value={fmt(summary.net)} />
        <Metric label="Deductions" value={fmt(summary.deductions)} />
      </div>
      <div className="pay-summary-tips">
        <Metric label="Tips paid separately" value={fmt(summary.cashTips)} />
      </div>
      <div className="pay-metrics pay-summary-status">
        <Metric
          label="Tracked gross marked paid"
          value={fmt(summary.paid)}
          accent
        />
        <Metric label="Outstanding gross" value={fmt(summary.outstanding)} />
      </div>
      <div className="pay-summary-notes">
        <p>
          {summary.confirmedCount
            ? `Includes ${summary.confirmedCount} confirmed receipt(s); remaining work uses an estimate.`
            : summary.estimate.label}
        </p>
        <p>
          Take-home excludes tips paid separately. Actual payslip amounts may
          differ from tracked work and appear under Received Paychecks.
        </p>
        {summary.taxSetAside > 0 && (
          <p>Tax set-aside included: {fmt(summary.taxSetAside)}</p>
        )}
      </div>
      {!summary.count && (
        <div className="pay-notice">
          <h3>No work in this period</h3>
          <p>
            Add time in <Link href="/tracker">Tracker</Link> or{" "}
            <Link href="/history">History</Link>, or choose another date range.
          </p>
        </div>
      )}
    </section>
  );
}
