"use client";
import Link from "next/link";
import {
  ChevronDown,
  Pencil,
  Trash2,
  Play,
  FolderOpen,
  Briefcase,
  Clock,
  DollarSign,
  BadgeCheck,
  Utensils,
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
import { formatDuration } from "@/features/tracker/model";

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

        <div className="entry-identity">
          <div className="entry-title-row">
            {project && (
              <span className="entry-project-icon" aria-hidden="true">
                <FolderOpen size={18} />
              </span>
            )}
            <h3>{project ? entry.projectName || "Project" : date}</h3>
            <span className="entry-job-badge">
              <Briefcase size={11} aria-hidden="true" />
              {job?.name ?? "No job assigned"}
              {job?.archived ? " (removed)" : ""}
            </span>
          </div>
          <p className="mono">
            {project
              ? `${entry.date} → ${entry.endDate ?? entry.date}`
              : `${entry.missingClockIn ? "Missing clock-in" : time(entry.startedAt)} → ${entry.endedAt ? time(entry.endedAt) : live ? "Now" : "Unfinished"}`}
          </p>
        </div>
        <div className="entry-stat-grid">
          {!project && (
            <div className="entry-stat">
              <small>
                <Clock size={12} aria-hidden="true" />
                Worked
              </small>
              <strong className="mono">
                {!live && status === "Incomplete"
                  ? "—"
                  : duration(workedMinutes(entry, live ? now : undefined))}
              </strong>
            </div>
          )}
          <div className="entry-amount entry-stat">
            <small>
              <DollarSign size={12} aria-hidden="true" />
              {project ? "Flat rate" : "Earned"}
            </small>
            <strong className="mono">{fmt(earnings)}</strong>
            {!project && (entry.tips ?? 0) > 0 && (
              <span className="entry-tips">
                incl. {fmt(entry.tips ?? 0)} tips
              </span>
            )}
          </div>
          <div className="entry-stat">
            <small>
              <BadgeCheck size={12} aria-hidden="true" />
              Status
            </small>
            <span
              className={`payment-badge ${status.startsWith("Paid") ? "received" : status === "Unpaid" ? "unpaid" : ""}`}
            >
              {status}
            </span>
          </div>
          {!project && (
            <div className="entry-stat">
              <small>
                <Utensils size={12} aria-hidden="true" />
                Lunch{" "}
                {entry.lunchPaid && (
                  <span className="entry-paid-lunch">Paid</span>
                )}
              </small>
              <strong className="mono">
                {formatDuration(entry.lunchMinutes * 60)}
              </strong>
            </div>
          )}
        </div>
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
                    Lunch: {formatDuration(entry.lunchMinutes * 60)} (
                    {entry.lunchPaid ? "paid" : "unpaid"})
                  </p>
                  <p>
                    Breaks: {formatDuration(entry.breakMinutes * 60)}
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
                receipt in Pay to change its payment status.
              </small>
            )}
          </div>
        </details>
      )}
    </article>
  );
}
