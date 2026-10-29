"use client";
import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { useApp } from "@/components/WorkspaceProvider";
import { dailySummary } from "../dailySummary";
import { formatDuration } from "../model";
import { money } from "@/features/history/model";
export function TodaySummary({ now }: { now: number }) {
  const data = useApp(),
    summary = dailySummary(data, now);
  const [summaryMode, setSummaryMode] = useState("gross");
  const fmt = (amount: number, currency: string) =>
    data.payVisible ? money(amount, currency) : "•••••";
  return (
    <section className="card summary tracker-summary">
      <div className="summary-header">
        <div className="summary-title">
          <span className="panel-icon panel-icon-brand" aria-hidden="true">
            <TrendingUp size={16} />
          </span>
          <div>
            <h2>Today&apos;s Summary</h2>
            <small>Completed work plus running shifts</small>
          </div>
        </div>
        <div className="summary-pay">
          <div
            className="chips summary-mode"
            role="group"
            aria-label="Summary pay estimate"
          >
            {["gross", "net"].map((mode) => (
              <button
                key={mode}
                aria-pressed={summaryMode === mode}
                onClick={() => setSummaryMode(mode)}
              >
                {mode === "gross" ? "Gross" : "Estimated net"}
              </button>
            ))}
          </div>
          {summary.groups.length === 1 && (
            <div className="summary-amount mono">
              {fmt(
                summaryMode === "net"
                  ? summary.groups[0].net
                  : summary.groups[0].gross,
                summary.groups[0].currency,
              )}
            </div>
          )}
        </div>
      </div>
      {!summary.groups.length ? (
        <p className="empty">
          No time recorded today. Clock in or enter today&apos;s times below.
        </p>
      ) : (
        summary.groups.map((total) => (
          <div className="currency-row" key={total.currency}>
            <small>
              {total.currency} · {total.completedCount} completed ·{" "}
              {total.runningCount} running
              {total.projectCount ? ` · ${total.projectCount} project(s)` : ""}
            </small>
            {summary.groups.length > 1 && (
              <div className="summary-amount mono">
                {fmt(
                  summaryMode === "net" ? total.net : total.gross,
                  total.currency,
                )}
              </div>
            )}
            <div className="stats">
              <div>
                <small>Worked</small>
                <strong className="mono">
                  {formatDuration(total.workedSeconds)}
                </strong>
              </div>
              <div>
                <small>Lunch / breaks</small>
                <strong className="mono">
                  {Math.round(total.lunchSeconds / 60)}m /{" "}
                  {Math.round(total.breakSeconds / 60)}m
                </strong>
              </div>
              <div>
                <small>Regular</small>
                <strong className="mono">
                  {formatDuration(total.regularSeconds)}
                </strong>
              </div>
              <div>
                <small>Overtime</small>
                <strong className="mono">
                  {formatDuration(total.overtimeSeconds)}
                </strong>
              </div>
            </div>
            {total.tips > 0 && (
              <small>
                Tips {fmt(total.tips, total.currency)} included once in gross.
              </small>
            )}
          </div>
        ))
      )}
    </section>
  );
}
