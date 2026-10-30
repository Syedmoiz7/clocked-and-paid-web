"use client";
import { TrendingUp, Clock } from "lucide-react";
import type { AppState } from "@/types";
import { duration, money, localDate } from "@/features/history/model";
import { payPeriod } from "@/features/history/payPeriods";
import {
  daysBetween,
  financialSummary,
  periodEntries,
  shiftAmounts,
  type Bounds,
} from "../model";
import { Metric } from "./Shared";

type Props = {
  data: AppState;
  jobId: string | null;
  currency: string;
  bounds: Bounds;
};
export function Progress({ data, jobId, currency, bounds }: Props) {
  const summary = financialSummary(
    data,
    bounds,
    jobId,
    currency,
    Date.now(),
    false,
    false,
  );
  const job = data.jobs.find(
      (job) =>
        job.id === jobId &&
        (job.currency ?? data.preferences.currency) === currency &&
        job.payFrequency &&
        job.payPeriodStart,
    ),
    period = job ? payPeriod(localDate(), job) : null;
  const progress = period
    ? Math.max(
        0,
        Math.min(
          100,
          ((daysBetween(period.start, localDate()) + 1) /
            (daysBetween(period.start, period.end) + 1)) *
            100,
        ),
      )
    : 0;
  return (
    <>
      <div className="pay-metrics">
        <Metric label="Hours worked" value={duration(summary.minutes)} />
        <Metric label="Overtime" value={duration(summary.overtime)} />
        <Metric label="Days worked" value={summary.daysWorked} />
      </div>
      {period && (
        <>
          <p>
            {job?.name} · {period.start} → {period.end} · {Math.round(progress)}
            % of calendar days elapsed
          </p>
          <progress
            aria-label="Current job pay-period progress"
            max={100}
            value={progress}
          />
        </>
      )}
    </>
  );
}

type Row = { date: string; earnings: number; hours: number };
function Chart({
  title,
  rows,
  kind,
  data,
  currency,
}: {
  title: string;
  rows: Row[];
  kind: "earnings" | "hours";
  data: AppState;
  currency: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row[kind])),
    hidden = kind === "earnings" && !data.payVisible;
  const value = (row: Row) =>
    kind === "hours"
      ? `${row.hours.toFixed(1)}h`
      : hidden
        ? "Hidden"
        : money(row.earnings, currency);
  return (
    <div className="pay-chart">
      <h3>
        {kind === "earnings" ? (
          <TrendingUp size={16} aria-hidden="true" />
        ) : (
          <Clock size={16} aria-hidden="true" />
        )}
        {title}
      </h3>
      <div
        className="pay-chart-scroll"
        role="region"
        aria-label={title}
        tabIndex={0}
      >
        <div className="pay-chart-bars">
          {rows.map((row) => (
            <div
              className={`pay-bar ${kind}`}
              key={row.date}
              tabIndex={0}
              aria-label={`${row.date}: ${value(row)}`}
              title={`${row.date}: ${value(row)}`}
            >
              <div className="pay-bar-track">
                <span
                  style={{
                    height: `${hidden ? 3 : Math.max(2, (row[kind] / max) * 100)}%`,
                  }}
                />
              </div>
              <small>{row.date.slice(5)}</small>
              <strong>{value(row)}</strong>
            </div>
          ))}
        </div>
      </div>
      <details>
        <summary>View chart data</summary>
        <div className="table-scroll">
          <table>
            <caption>{title}</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>{kind === "hours" ? "Hours" : `Earnings (${currency})`}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <th scope="row">{row.date}</th>
                  <td>{value(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
export function Trends({ data, jobId, currency, bounds }: Props) {
  const entries = periodEntries(data, bounds, jobId, currency),
    dates = new Map<string, Row>();
  entries.forEach((entry) => {
    const value = shiftAmounts(entry, data),
      row = dates.get(entry.date) ?? {
        date: entry.date,
        earnings: 0,
        hours: 0,
      };
    row.earnings += value.gross + value.cashTips;
    row.hours += value.minutes / 60;
    dates.set(entry.date, row);
  });
  const rows = [...dates.values()].sort((a, b) => a.date.localeCompare(b.date)),
    summary = financialSummary(
      data,
      bounds,
      jobId,
      currency,
      Date.now(),
      false,
      false,
    ),
    fmt = (value: number) =>
      data.payVisible ? money(value, currency) : "•••••";
  if (!rows.length)
    return (
      <p>Add completed shifts or projects to see earnings and hours trends.</p>
    );
  return (
    <>
      <Chart
        title="Earnings over time · includes all tips"
        rows={rows}
        kind="earnings"
        data={data}
        currency={currency}
      />
      <Chart
        title="Hours worked"
        rows={rows}
        kind="hours"
        data={data}
        currency={currency}
      />
      <h3>Earnings by job</h3>
      <ul className="pay-lines">
        {summary.rows.map((row) => (
          <li key={row.jobId ?? "none"}>
            <span>
              {data.jobs.find((job) => job.id === row.jobId)?.name ??
                "No job assigned"}
            </span>
            <span>
              {fmt(row.gross)} gross · {fmt(row.cashTips)} separate tips ·{" "}
              {duration(row.minutes)}
            </span>
          </li>
        ))}
      </ul>
      <h3>Payment status</h3>
      <div className="pay-metrics">
        <Metric
          label="Tracked gross marked paid"
          value={fmt(summary.paid)}
          accent
        />
        <Metric label="Outstanding gross" value={fmt(summary.outstanding)} />
      </div>
    </>
  );
}
