"use client";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Field, Toggle } from "@/components/Fields";
import { useApp } from "@/components/WorkspaceProvider";
import type { HistoryFilters as Filters } from "../model";
import { periods, rangeLabel } from "../viewModel";
export function HistoryFilters({
  filters,
  onChange,
  onClear,
  now,
}: {
  filters: Filters;
  onChange: (changes: Partial<Filters>) => void;
  onClear: () => void;
  now: number;
}) {
  const data = useApp(),
    [expanded, setExpanded] = useState(false);
  const count = [
    filters.jobId !== null,
    filters.type !== "all",
    filters.unpaidOnly,
    filters.earnings !== "all",
    filters.excludeTips,
  ].filter(Boolean).length;
  return (
    <section className="card history-filters" aria-label="History filters">
      <div className="filter-toolbar">
        <div className="chips" aria-label="History period">
          {periods.map((period) => (
            <button
              key={period.value}
              aria-pressed={filters.period === period.value}
              onClick={() => onChange({ period: period.value })}
            >
              {period.label}
            </button>
          ))}
        </div>
        <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <SlidersHorizontal size={15} /> {expanded ? "Hide" : "More"} filters
          {count ? ` (${count})` : ""}
        </button>
      </div>
      <p className="range-label" role="status">
        {rangeLabel(filters, new Date(now))}
      </p>
      {!data.isPremium && (
        <small>
          Free access shows entries from the current month, within your selected
          range.
        </small>
      )}
      {filters.period === "custom" && (
        <div className="field-grid">
          <Field
            label="From date"
            type="date"
            value={filters.from}
            onChange={(event) => onChange({ from: event.target.value })}
          />
          <Field
            label="To date"
            type="date"
            value={filters.to}
            onChange={(event) => onChange({ to: event.target.value })}
          />
        </div>
      )}
      {expanded && (
        <div className="advanced-filters form-stack">
          <div className="field-grid">
            <label className="field">
              <span>Filter by job</span>
              <select
                value={filters.jobId ?? ""}
                onChange={(event) =>
                  onChange({ jobId: event.target.value || null })
                }
              >
                <option value="">All jobs</option>
                {data.jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.name}
                    {job.archived ? " (removed)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Entry type</span>
              <select
                value={filters.type}
                onChange={(event) =>
                  onChange({ type: event.target.value as Filters["type"] })
                }
              >
                <option value="all">Shifts & projects</option>
                <option value="shifts">Shifts only</option>
                <option value="projects">Projects only</option>
              </select>
            </label>
            <label className="field">
              <span>Earnings view</span>
              <select
                value={filters.earnings}
                onChange={(event) =>
                  onChange({
                    earnings: event.target.value as Filters["earnings"],
                    excludeTips: false,
                    excludeDeductions: false,
                  })
                }
              >
                <option value="all">Gross earnings</option>
                <option value="net">Estimated net</option>
                <option value="tips">Tips only</option>
              </select>
            </label>
          </div>
          <Toggle
            label="Unpaid entries only"
            checked={filters.unpaidOnly}
            onChange={(unpaidOnly) => onChange({ unpaidOnly })}
          />
          {filters.earnings !== "tips" && (
            <Toggle
              label="Exclude tips from displayed earnings"
              checked={filters.excludeTips}
              onChange={(excludeTips) => onChange({ excludeTips })}
            />
          )}
          <div className="actions">
            <button onClick={onClear}>Clear all filters</button>
          </div>
        </div>
      )}
    </section>
  );
}
