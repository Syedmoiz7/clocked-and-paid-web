"use client";
import { useRef, useState, useId } from "react";
import { Field, Modal, Toggle } from "@/components/Fields";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import {
  currencies,
  duration,
  localDate,
  money,
  paymentStatus,
  prepareEntry,
  workedMinutes,
  type EntryDraft,
} from "../model";
import type { Shift } from "@/types";

export function EntryForm({
  initial,
  original,
  onSave,
  onClose,
}: {
  initial: EntryDraft;
  original?: Shift;
  onSave: (draft: EntryDraft, original?: Shift) => Promise<string | null>;
  onClose: () => void;
}) {
  const data = useApp(),
    { busy: workspaceBusy } = useWorkspace();
  const [draft, setDraft] = useState(initial),
    [error, setError] = useState("");
  const [saving, setSaving] = useState(false),
    pending = useRef(false);
  const [lunchMode, setLunchMode] = useState(
    initial.lunchStart || initial.lunchEnd ? "times" : "minutes",
  );
  const busy = saving || workspaceBusy,
    notesId = useId();
  const project = draft.entryType === "project",
    complete = project || Boolean(draft.start && draft.end);
  const existing =
    original && data.history.find((entry) => entry.id === original.id);
  const paymentLocked = Boolean(
    existing &&
    paymentStatus(existing, data.paychecks, data.jobs) === "Paid via Paycheck",
  );
  const preview = prepareEntry(
    draft,
    data.jobs,
    data.defaultPlan,
    original,
    data.preferences.currency,
  );
  const update = (changes: Partial<EntryDraft>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setError("");
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending.current || workspaceBusy) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const message = await onSave(draft, original);
      if (message) setError(message);
      else onClose();
    } catch {
      setError("Could not save. Your inputs are still here; please try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const time = (
    key: "start" | "end" | "lunchStart" | "lunchEnd",
    label: string,
  ) => (
    <div className="optional-time">
      <Field
        type="time"
        label={label}
        value={draft[key]}
        onChange={(event) =>
          update({
            [key]: event.target.value,
            ...((key === "start" || key === "end") && !event.target.value
              ? { paid: false }
              : {}),
          })
        }
      />
      {draft[key] && (
        <button
          type="button"
          className="text-button"
          onClick={() =>
            update({
              [key]: "",
              ...(key === "start" || key === "end" ? { paid: false } : {}),
            })
          }
        >
          Clear {label.toLowerCase()}
        </button>
      )}
    </div>
  );
  return (
    <Modal
      title={`${original ? "Edit" : "Add"} ${project ? "project" : "shift"}`}
      busy={busy}
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)} className="form-stack">
        <fieldset disabled={busy} className="form-stack">
          <Field
            type="date"
            label={project ? "Start date" : "Date"}
            required
            value={draft.date}
            onChange={(event) => update({ date: event.target.value })}
          />
          {!original &&
            !project &&
            data.history.some((entry) => entry.date === draft.date) && (
              <small>
                This date already has an entry. Saving adds a separate shift.
              </small>
            )}
          {!data.isPremium &&
            draft.date.slice(0, 7) !== localDate().slice(0, 7) && (
              <small>
                Older entries can be saved on Free; viewing them requires
                Premium.
              </small>
            )}
          {project ? (
            <>
              <Field
                label="Project name"
                required
                value={draft.projectName}
                onChange={(event) =>
                  update({ projectName: event.target.value })
                }
              />
              <div className="field-grid">
                <Field
                  label="End date"
                  type="date"
                  value={draft.endDate}
                  onChange={(event) => update({ endDate: event.target.value })}
                />
                <Field
                  label="Flat payout"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={draft.flatAmount}
                  onChange={(event) =>
                    update({ flatAmount: event.target.value })
                  }
                />
              </div>
              <label className="field">
                <span>Currency</span>
                <select
                  value={draft.currency}
                  onChange={(event) => update({ currency: event.target.value })}
                >
                  {currencies.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <>
              <div className="field-grid">
                {time("start", "Clock in")}
                {time("end", "Clock out")}
              </div>
              <fieldset className="form-stack">
                <legend>Lunch input · choose one method</legend>
                <div className="chips">
                  {["minutes", "times"].map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      aria-pressed={lunchMode === mode}
                      onClick={() => {
                        if (mode !== lunchMode) {
                          setLunchMode(mode);
                          update({
                            lunchStart: "",
                            lunchEnd: "",
                            lunchMinutes: "0",
                          });
                        }
                      }}
                    >
                      {mode === "minutes"
                        ? "Total minutes"
                        : "Start / end times"}
                    </button>
                  ))}
                </div>
                {lunchMode === "minutes" ? (
                  <Field
                    label="Recorded lunch (minutes)"
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={draft.lunchMinutes}
                    onChange={(event) =>
                      update({ lunchMinutes: event.target.value })
                    }
                  />
                ) : (
                  <div className="field-grid">
                    {time("lunchStart", "Lunch start")}
                    {time("lunchEnd", "Lunch end")}
                  </div>
                )}
                <Toggle
                  label="Paid lunch (counts toward paid hours)"
                  checked={draft.lunchPaid}
                  onChange={(lunchPaid) => update({ lunchPaid })}
                />
              </fieldset>
              {draft.breaks.length ? (
                <div className="notice form-stack">
                  <h3>
                    Recorded unpaid breaks ·{" "}
                    {duration(Number(draft.breakMinutes))}
                  </h3>
                  {draft.breaks.map((item) => (
                    <small key={item.id}>
                      {item.label || "Break"}:{" "}
                      {new Date(item.start).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: data.preferences.clockFormat === "12h",
                      })}{" "}
                      →{" "}
                      {item.end
                        ? new Date(item.end).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: data.preferences.clockFormat === "12h",
                          })
                        : "Incomplete"}
                    </small>
                  ))}
                  <button type="button" onClick={() => update({ breaks: [] })}>
                    Replace recorded breaks with total minutes
                  </button>
                </div>
              ) : (
                <Field
                  label="Unpaid breaks (minutes)"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={draft.breakMinutes}
                  onChange={(event) =>
                    update({ breakMinutes: event.target.value })
                  }
                />
              )}
              <Field
                label="Break label"
                value={draft.breakLabel}
                onChange={(event) => update({ breakLabel: event.target.value })}
              />
              <div className="field-grid">
                <Field
                  label="Custom hourly rate (optional)"
                  type="number"
                  min="0"
                  step="any"
                  value={draft.customRate}
                  onChange={(event) =>
                    update({ customRate: event.target.value })
                  }
                />
                <Field
                  label="Tips earned"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={draft.tips}
                  onChange={(event) => update({ tips: event.target.value })}
                />
              </div>
              {Number(draft.tips) > 0 && (
                <label className="field">
                  <span>Tip type</span>
                  <select
                    value={draft.tipType}
                    onChange={(event) =>
                      update({
                        tipType: event.target.value as EntryDraft["tipType"],
                      })
                    }
                  >
                    <option value="cash">Cash</option>
                    <option value="paycheck">On paycheck</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              )}
            </>
          )}
          <label className="field">
            <span>Job (optional)</span>
            <select
              value={draft.jobId ?? ""}
              onChange={(event) => {
                const jobId = event.target.value || null;
                update({
                  jobId,
                  ...(!project
                    ? {
                        currency:
                          data.jobs.find((job) => job.id === jobId)?.currency ??
                          data.preferences.currency,
                      }
                    : {}),
                });
              }}
            >
              <option value="">No job assigned</option>
              {data.jobs
                .filter((job) => !job.archived || job.id === draft.jobId)
                .map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.name}
                    {job.archived ? " (removed)" : ""}
                  </option>
                ))}
            </select>
          </label>
          <label className="field" htmlFor={notesId}>
            <span>Notes (optional)</span>
            <textarea
              id={notesId}
              rows={3}
              value={draft.notes}
              onChange={(event) => update({ notes: event.target.value })}
            />
          </label>
          {paymentLocked ? (
            <p>
              Paid via Paycheck. Payment status is controlled by the saved
              receipt.
            </p>
          ) : complete ? (
            <Toggle
              label="Payment received"
              checked={draft.paid}
              onChange={(paid) => update({ paid })}
            />
          ) : (
            <p>
              Incomplete entry: no wages or worked hours until both clock times
              are saved. This does not start a running timer.
            </p>
          )}
          <div className="notice" aria-live="polite">
            <h3>Preview</h3>
            {preview.ok ? (
              <>
                {!project && (
                  <p>
                    {duration(workedMinutes(preview.entry))} paid work
                    {draft.start && draft.end && draft.end < draft.start
                      ? " · clock-out is the next day"
                      : ""}
                  </p>
                )}
                <p>
                  Gross including tips:{" "}
                  <strong>
                    {data.payVisible
                      ? money(
                          preview.entry.earnings +
                            (project ? 0 : (preview.entry.tips ?? 0)),
                          preview.entry.currency ?? data.preferences.currency,
                        )
                      : "•••••"}
                  </strong>
                </p>
              </>
            ) : (
              <p>{preview.error}</p>
            )}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="feedback error">
            {error}
          </p>
        )}
        <div className="dialog-footer actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {saving
              ? "Saving…"
              : original
                ? "Save changes"
                : project
                  ? "Save project"
                  : complete
                    ? "Save completed shift"
                    : "Save incomplete entry"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
