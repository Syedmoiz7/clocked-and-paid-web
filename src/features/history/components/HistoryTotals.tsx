"use client";
import { useApp } from "@/components/WorkspaceProvider";
import type { Shift } from "@/types";
import { duration, money, type HistoryFilters } from "../model";
import { historySummary } from "../summary";

export function HistoryTotals({
  entries,
  live = [],
  filters,
  now,
}: {
  entries: Shift[];
  live?: Shift[];
  filters?: HistoryFilters;
  now: number;
}) {
  const data = useApp(),
    totals = historySummary(entries, data, live, now);
  const label =
    filters?.earnings === "tips"
      ? "Total tips"
      : filters?.earnings === "net"
        ? "Estimated net"
        : filters?.excludeTips
          ? "Wages only"
          : "Total earned";
  return (
    <div className="history-totals" aria-label="History totals">
      {totals.map((total) => {
        const shown =
          filters?.earnings === "tips"
            ? total.tips
            : Math.max(
                0,
                total.wages +
                  (filters?.excludeTips ? 0 : total.tips) -
                  (filters?.earnings === "net" ? total.deductions : 0),
              );
        const fmt = (amount: number) =>
          data.payVisible ? money(amount, total.currency) : "•••••";
        const records = [...entries, ...live].filter(
          (entry) =>
            (entry.currency ??
              data.jobs.find((job) => job.id === entry.jobId)?.currency ??
              data.preferences.currency) === total.currency,
        );
        return (
          <section className="card" key={total.currency}>
            <small>
              {label} · {total.currency}
            </small>
            <div className="summary-amount mono">{fmt(shown)}</div>
            <div className="stats">
              <div>
                <small>Hours worked</small>
                <strong>{duration(total.minutes)}</strong>
              </div>
              <div>
                <small>Entries</small>
                <strong>{records.length}</strong>
              </div>
              <div>
                <small>
                  Tips{filters?.excludeTips ? " (excluded)" : " included"}
                </small>
                <strong>{fmt(total.tips)}</strong>
              </div>
            </div>
            {filters?.earnings === "net" && (
              <p className="totals-note">
                Saved deductions: {fmt(total.deductions)}. Estimate only; actual
                take-home comes from paycheck records.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
