"use client";
import Link from "next/link";
import {
  ChevronDown,
  Pencil,
  Trash2,
  Play,
  BriefcaseBusiness,
} from "lucide-react";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import {
  duration,
  money,
  paymentStatus,
  selectable,
  wagesFor,
  workedMinutes,
} from "../model";
import { canResume, entryCurrency } from "../summary";
import type { Shift } from "@/types";

export function HistoryEntry({
  entry,
  live = false,
  now,
  selectionMode = false,
  selected = false,
  onSelect,
  onEdit,
  onPaid,
  onDelete,
  onResume,
}: {
  entry: Shift;
  live?: boolean;
  now: number;
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onPaid?: () => void;
  onDelete?: () => void;
  onResume?: () => void;
}) {
  const data = useApp(),
    { busy } = useWorkspace();
  const project = entry.entryType === "project",
    job = data.jobs.find((item) => item.id === entry.jobId);
  const currency = entryCurrency(entry, data),
    status = live ? "Running" : paymentStatus(entry, data.paychecks, data.jobs);
  const earnings =
    wagesFor(
      entry,
      data.jobs,
      data.activeShift?.id === entry.id ? data.todayPlan : data.defaultPlan,
      live ? now : undefined,
    ) + (project ? 0 : (entry.tips ?? 0));
  const fmt = (amount: number) =>
    data.payVisible ? money(amount, currency) : "•••••";
  const time = (value: string) =>
    new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: data.preferences.clockFormat === "12h",
    });
  const date = new Date(`${entry.date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <article
      className={`history-entry ${project ? "project-entry" : ""} ${selected ? "selected-entry" : ""}`}
      data-entry-id={entry.id}
    >
      <div className="entry-main">
        <div className="entry-date">
          {project ? (
            <BriefcaseBusiness size={20} />
          ) : (
            <>
              <strong>{entry.date.slice(8)}</strong>
              <small>
                {new Date(`${entry.date}T12:00:00`).toLocaleDateString(
                  "en-US",
                  { month: "short" },
                )}
              </small>
            </>
          )}
        </div>
        <div className="entry-identity">
          <h3>{project ? entry.projectName || "Project" : date}</h3>
          <p>
            {project
              ? `${entry.date} → ${entry.endDate ?? entry.date}`
              : `${entry.missingClockIn ? "Missing clock-in" : time(entry.startedAt)} → ${entry.endedAt ? time(entry.endedAt) : live ? "Now" : "Unfinished"}`}
          </p>
          <small>
            {job?.name ?? "No job assigned"}
            {job?.archived ? " (removed)" : ""}
            {!project
              ? ` · ${duration(workedMinutes(entry, live ? now : undefined))}`
              : ""}
          </small>
        </div>
        <div className="entry-amount">
          <strong className="mono">{fmt(earnings)}</strong>
          <span
            className={`payment-badge ${status.startsWith("Paid") ? "received" : ""}`}
          >
            {status}
          </span>
        </div>
        {selectionMode && !live && (
          <label className="entry-check">
            <input
              type="checkbox"
              aria-label={`Select shift ${entry.date} ${entry.id}`}
              checked={selected}
              disabled={busy || !selectable(entry, data.paychecks, data.jobs)}
              onChange={onSelect}
            />
          </label>
        )}
      </div>
      {live ? (
        <div className="entry-footer">
          <small>
            Live work is included once in matching totals. Manage this running
            shift in Tracker.
          </small>
          <Link className="button-link" href="/tracker">
            Open Tracker →
          </Link>
        </div>
      ) : (
        <details className="entry-details">
          <summary>
            Details & actions <ChevronDown size={15} />
          </summary>
          <div className="form-stack">
            <div className="entry-detail-grid">
              {!project && (
                <>
                  <p>
                    Lunch: {entry.lunchMinutes}m (
                    {entry.lunchPaid ? "paid" : "unpaid"})
                  </p>
                  <p>
                    Breaks: {entry.breakMinutes}m
                    {entry.breakLabel ? ` · ${entry.breakLabel}` : ""}
                  </p>
                  <p>
                    Tips: {fmt(entry.tips ?? 0)} ·{" "}
                    {entry.tipType === "paycheck"
                      ? "on paycheck"
                      : (entry.tipType ?? "cash")}
                  </p>
                </>
              )}
              <p>Currency: {currency}</p>
            </div>
            {entry.projectNotes && (
              <p className="entry-notes">{entry.projectNotes}</p>
            )}
            <div className="actions">
              <button disabled={busy} onClick={onEdit}>
                <Pencil size={14} /> Edit
              </button>
              <button
                disabled={
                  busy ||
                  status === "Incomplete" ||
                  status === "Paid via Paycheck"
                }
                onClick={onPaid}
              >
                {entry.paid ? "Mark unpaid" : "Mark paid"}
              </button>
              {!project && !entry.missingClockIn && !entry.endedAt && (
                <button
                  disabled={busy || !canResume(entry, data, now)}
                  onClick={onResume}
                >
                  <Play size={14} /> Resume in Tracker
                </button>
              )}
              <button className="danger" disabled={busy} onClick={onDelete}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
            {status === "Paid via Paycheck" && (
              <small>
                Payment status comes from a saved paycheck receipt. Edit the
                receipt in Pay when that web module is available.
              </small>
            )}
          </div>
        </details>
      )}
    </article>
  );
}
