"use client";
import { useState } from "react";
import { Wallet } from "lucide-react";
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
    <section className="card summary">
      <div className="section-heading">
        <h2>
          <Wallet size={17} /> Today&apos;s Summary
        </h2>
        <div className="chips">
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
      </div>
      <small>
        All entries dated today · completed work plus running shifts
      </small>
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
            <div className="summary-amount mono">
              {fmt(
                summaryMode === "net" ? total.net : total.gross,
                total.currency,
              )}
            </div>
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
