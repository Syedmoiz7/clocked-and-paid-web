"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Field } from "@/components/Fields";
import { useApp } from "@/components/WorkspaceProvider";
import {
  defaultFilters,
  duration,
  localDate,
  money,
  workedMinutes,
} from "../model";
import { entryCurrency, historySummary } from "../summary";
import {
  calendarGroups,
  savedCalendarEntries,
  type CalendarMode,
  type CalendarGroup,
} from "../viewModel";
import { HistoryTotals } from "./HistoryTotals";
import type { Shift } from "@/types";
const modes: { value: CalendarMode; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "payperiods", label: "Pay Periods" },
  { value: "summary", label: "Summary" },
];

export function CalendarView({
  onEdit,
  now,
}: {
  onEdit: (entry: Shift) => void;
  now: number;
}) {
  const data = useApp(),
    [mode, setMode] = useState<CalendarMode>("monthly");
  const [year, setYear] = useState(new Date().getFullYear()),
    [month, setMonth] = useState(new Date().getMonth());
  const [day, setDay] = useState(localDate()),
    [jobId, setJobId] = useState("");
  const [from, setFrom] = useState(`${localDate().slice(0, 7)}-01`),
    [to, setTo] = useState(localDate());
  const entries = savedCalendarEntries(data, jobId),
    groups = calendarGroups(
      mode,
      year,
      month,
      day,
      entries,
      data,
      jobId,
      from,
      to,
    );
  const monthlyNavigation = mode === "daily" || mode === "payperiods";
  const move = (offset: number) => {
    if (monthlyNavigation) {
      const next = new Date(year, month + offset, 1, 12);
      setYear(next.getFullYear());
      setMonth(next.getMonth());
      setDay(localDate(next));
    } else setYear((value) => value + offset);
  };
  const format = (value: number, currency: string) =>
    data.payVisible ? money(value, currency) : "•••••";
  const title = monthlyNavigation
    ? new Date(year, month, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : String(year);
  const details = (group: CalendarGroup) => (
    <div className="calendar-group-entries">
      {!group.entries.length ? (
        <p>No entries for this period.</p>
      ) : (
        group.entries.map((entry) => (
          <button
            key={entry.id}
            className="calendar-entry-link"
            onClick={() => onEdit(entry)}
          >
            <span>
              {entry.date} ·{" "}
              {entry.entryType === "project"
                ? entry.projectName
                : duration(workedMinutes(entry))}
            </span>
            <strong>
              {format(
                historySummary([entry], data)[0]?.gross ?? 0,
                entryCurrency(entry, data),
              )}
            </strong>
            <small>Edit →</small>
          </button>
        ))
      )}
    </div>
  );
  const groupCard = (group: CalendarGroup, index: number) => {
    const minutes = group.entries.reduce(
      (sum, entry) => sum + workedMinutes(entry),
      0,
    );
    const days = new Set(
      group.entries
        .filter((entry) => workedMinutes(entry) > 0)
        .map((entry) => entry.date),
    ).size;
    return (
      <details
        className="card calendar-group"
        key={group.key}
        open={mode === "daily" || mode === "summary" ? true : undefined}
      >
        <summary>
          <div>
            <h3>{group.label}</h3>
            <small>
              {duration(minutes)} · {days} days worked · {group.entries.length}{" "}
              entries
            </small>
          </div>
          <div>
            {historySummary(group.entries, data).map((total) => (
              <strong key={total.currency} className="mono">
                {total.currency} {format(total.gross, total.currency)}
              </strong>
            ))}
            {!group.entries.length && <small>No earnings</small>}
          </div>
        </summary>
        {details(group)}
        {mode === "yearly" && (
          <div className="month-breakdown">
            <h3>Month breakdown</h3>
            {Array.from({ length: 12 }, (_, monthIndex) => {
              const prefix = `${group.start.slice(0, 4)}-${String(monthIndex + 1).padStart(2, "0")}`,
                rows = group.entries.filter((entry) =>
                  entry.date.startsWith(prefix),
                );
              return (
                <div key={prefix}>
                  <span>
                    {new Date(
                      Number(group.start.slice(0, 4)),
                      monthIndex,
                      1,
                    ).toLocaleDateString("en-US", { month: "short" })}
                  </span>
                  <span>
                    {duration(
                      rows.reduce(
                        (sum, entry) => sum + workedMinutes(entry),
                        0,
                      ),
                    )}
                  </span>
                  <span>
                    {historySummary(rows, data)
                      .map(
                        (total) =>
                          `${total.currency} ${format(total.gross, total.currency)}`,
                      )
                      .join(" · ") || "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </details>
    );
  };
  return (
    <div className="history-calendar form-stack">
      <section className="card form-stack">
        <div className="section-heading">
          <h2>
            <CalendarDays size={18} aria-hidden="true" /> Calendar views
          </h2>
          <small>Gross earnings include tips once</small>
        </div>
        <p>
          Saved entries only. Live work appears in Tracker and the History list.
          Calendar controls are independent of list filters.
        </p>
        <div className="chips" aria-label="Calendar views">
          {modes.map((option) => (
            <button
              key={option.value}
              aria-pressed={mode === option.value}
              onClick={() => setMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Calendar job</span>
          <select
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
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
        {mode !== "summary" && (
          <div className="calendar-navigation">
            <button
              aria-label="Previous calendar period"
              onClick={() => move(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <h3>{title}</h3>
            <button aria-label="Next calendar period" onClick={() => move(1)}>
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => {
                const date = new Date();
                setYear(date.getFullYear());
                setMonth(date.getMonth());
                setDay(localDate(date));
              }}
            >
              Today
            </button>
          </div>
        )}
        {mode === "summary" && (
          <div className="field-grid">
            <Field
              label="Summary from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <Field
              label="Summary to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        )}
        {mode === "daily" && (
          <div className="calendar-grid" aria-label="Choose a calendar day">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
              <small key={label}>{label}</small>
            ))}
            {Array.from(
              { length: (new Date(year, month, 1).getDay() + 6) % 7 },
              (_, index) => (
                <span key={`blank-${index}`} />
              ),
            )}
            {Array.from(
              { length: new Date(year, month + 1, 0).getDate() },
              (_, index) => {
                const date = localDate(new Date(year, month, index + 1, 12)),
                  rows = entries.filter((entry) => entry.date === date);
                return (
                  <button
                    key={date}
                    aria-label={`View ${date}${rows.length ? `, ${rows.length} ${rows.length === 1 ? "entry" : "entries"}` : ""}`}
                    aria-pressed={day === date}
                    onClick={() => setDay(date)}
                  >
                    <span>{index + 1}</span>
                    {rows.length > 0 && <span className="day-dot" />}
                  </button>
                );
              },
            )}
          </div>
        )}
      </section>
      {mode === "summary" && !groups.length && (
        <p className="error" role="alert">
          Select a valid summary date range.
        </p>
      )}
      {mode === "payperiods" && !groups.length && (
        <section className="card empty">
          <h3>{jobId ? "No pay schedule for this job" : "Choose a job"}</h3>
          <p>
            Pay periods need a job with a pay frequency and anchor date. Job
            schedules can be configured in Jobs.
          </p>
        </section>
      )}
      <div
        className={mode === "monthly" ? "calendar-months" : "calendar-groups"}
      >
        {groups.map(groupCard)}
      </div>
      {mode === "summary" && groups[0] && (
        <>
          <HistoryTotals
            entries={groups[0].entries}
            now={now}
            filters={{ ...defaultFilters(), earnings: "net" }}
          />
          <section className="card form-stack">
            <h3>Earnings breakdown by job</h3>
            {[
              ...new Set(groups[0].entries.map((entry) => entry.jobId ?? "")),
            ].map((id) => (
              <div key={id}>
                <h3>
                  {data.jobs.find((job) => job.id === id)?.name ??
                    "No job assigned"}
                </h3>
                <HistoryTotals
                  entries={groups[0].entries.filter(
                    (entry) => (entry.jobId ?? "") === id,
                  )}
                  now={now}
                />
              </div>
            ))}
            <small>
              Saved deduction rules are prorated by date as in Pay. These are
              estimates, not paycheck receipts.
            </small>
          </section>
        </>
      )}
    </div>
  );
}
