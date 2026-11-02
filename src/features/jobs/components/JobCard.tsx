"use client";
import { useState } from "react";
import { Briefcase, Pencil, Trash2, Star, ChevronDown } from "lucide-react";
import type { AppState, MockJob } from "@/types";
import { money, localDate } from "@/features/history/model";
import { clockLabel } from "@/features/settings/model";
import {
  jobBadges,
  jobInProgress,
  jobPayDelay,
  nextJobPayDate,
  schedulePreview,
  workInProgress,
} from "../model";
import { JobDeductions } from "./JobDeductions";

export function JobCard({
  data,
  job,
  busy,
  onEdit,
  onRemove,
  onSelect,
}: {
  data: AppState;
  job: MockJob;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onSelect: (makeDefault: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const settings = job.reminderSettings ?? data.preferences.defaultReminders;
  return (
    <article
      className={`job-card${job.isDefault ? " default-job" : ""}`}
      aria-label={`${job.name} profile`}
    >
      <div className="job-card-header">
        <span className="job-avatar" aria-hidden="true">
          {job.isDefault ? <Star size={14} /> : <Briefcase size={14} />}
        </span>
        <div className="job-identity">
          <div className="job-title-row">
            <span
              className="job-color-dot"
              style={{ backgroundColor: job.color }}
              aria-hidden="true"
            />
            <h3>{job.name}</h3>
            <div className="job-badges">
              {jobBadges(data, job).map((label) => (
                <span key={label} data-state={label}>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <p className="job-rate">
            {job.title && <>{job.title} · </>}
            {data.payVisible
              ? money(job.hourlyRate, job.currency ?? data.preferences.currency)
              : "•••••"}{" "}
            / hr · {job.currency ?? data.preferences.currency}
          </p>
        </div>
        <div className="job-card-tools">
          <button
            aria-label={`Edit ${job.name}`}
            disabled={busy}
            onClick={onEdit}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            className="job-details-button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Hide details" : "Details"}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <button
            aria-label={`Delete ${job.name}`}
            disabled={busy || jobInProgress(data, job.id)}
            onClick={onRemove}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      {(data.selectedJobId !== job.id || !job.isDefault) && (
        <div className="button-row job-selection-actions">
          {data.selectedJobId !== job.id && (
            <button
              disabled={busy || workInProgress(data)}
              onClick={() => onSelect(false)}
            >
              Use for Tracker
            </button>
          )}
          {!job.isDefault && (
            <button
              disabled={busy || workInProgress(data)}
              onClick={() => onSelect(true)}
            >
              Make default & select
            </button>
          )}
        </div>
      )}
      {expanded && (
        <div className="job-details">
          {job.notes && <p className="preserve-lines">{job.notes}</p>}
          {job.createdAt && (
            <p>Added {new Date(job.createdAt).toLocaleDateString()}</p>
          )}
          <div className="job-quick-facts" aria-label="Job defaults">
            <span>
              OT after{" "}
              {job.overtimeThreshold ?? data.defaultPlan.overtimeThreshold}h
            </span>
            <span>
              ×{job.overtimeMultiplier ?? data.defaultPlan.overtimeMultiplier}{" "}
              OT
            </span>
            <span>
              {(job.lunchEnabled ?? data.defaultPlan.lunchEnabled)
                ? `${job.lunchMinutes ?? data.defaultPlan.lunchMinutes}m lunch`
                : "Lunch off"}
            </span>
            <span className={job.enableTips ? "job-tips-badge" : ""}>
              Tips {job.enableTips ? "at clock-out" : "off"}
            </span>
          </div>
          <dl className="job-facts">
            <div>
              <dt>Lunch reminder</dt>
              <dd>
                {settings.lunchMode === "off"
                  ? "Off"
                  : settings.lunchMode === "fixed"
                    ? `At ${clockLabel(settings.lunchTime, data.preferences.clockFormat)}`
                    : `${settings.lunchHours}h after clock-in`}
              </dd>
            </div>
            <div>
              <dt>Reminder effects</dt>
              <dd>
                {settings.sound ? "Sound on" : "Silent"} ·{" "}
                {settings.overlay ? "Overlay" : "Inline"} ·{" "}
                {settings.custom.filter((item) => item.enabled).length} custom
                reminders
              </dd>
            </div>
            <div>
              <dt>Pay schedule</dt>
              <dd>
                {job.payFrequency ?? "Not set"}
                {job.payFrequency ? ` · ${jobPayDelay(job)}-day delay` : ""}
              </dd>
            </div>
            <div>
              <dt>Next expected pay</dt>
              <dd>{nextJobPayDate(job) ?? "Set a schedule"}</dd>
            </div>
          </dl>
          {job.payFrequency && (
            <div className="job-periods">
              {schedulePreview(job, localDate()).map((period) => (
                <div key={period.label}>
                  <strong>{period.label}</strong>
                  <span>
                    {period.start} → {period.end}
                  </span>
                </div>
              ))}
            </div>
          )}
          <JobDeductions data={data} job={job} busy={busy} />
        </div>
      )}
    </article>
  );
}
