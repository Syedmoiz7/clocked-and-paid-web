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
    <div className="pay-summary" data-testid="pay-summary">
      <div className="pay-row">
        <div>
          <p className="eyebrow">Take-home estimate</p>
          <strong className="pay-takehome">{fmt(summary.takeHome)}</strong>
        </div>
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
      <div className="pay-metrics">
        <Metric
          label="Tracked gross (paycheck tips included)"
          value={fmt(summary.gross)}
        />
        <Metric label="Net pay" value={fmt(summary.net)} accent />
        <Metric label="Deductions" value={fmt(summary.deductions)} />
        <Metric label="Tips paid separately" value={fmt(summary.cashTips)} />
        <Metric
          label="Tracked gross marked paid"
          value={fmt(summary.paid)}
          accent
        />
        <Metric label="Outstanding gross" value={fmt(summary.outstanding)} />
      </div>
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
      {!summary.count && (
        <div className="pay-notice">
          <h3>No work in this period</h3>
          <p>
            Add time in <Link href="/tracker">Tracker</Link> or{" "}
            <Link href="/history">History</Link>, or choose another date range.
          </p>
        </div>
      )}
    </div>
  );
}
