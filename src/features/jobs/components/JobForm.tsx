"use client";
import { useState } from "react";
import { Field, Modal, Toggle } from "@/components/Fields";
import {
  FormFooter,
  usePayForm,
  Confirm,
} from "@/features/pay/components/Shared";
import type {
  AppState,
  CustomReminder,
  MockJob,
  JobReminderSettings,
} from "@/types";
import {
  currencies,
  jobColors,
  jobDraftNumbers,
  jobInProgress,
  jobReferenced,
  jobScheduleChanged,
  prepareJobDraft,
  workInProgress,
  type JobNumbers,
} from "../model";
import { JobSchedule } from "./JobSchedule";
import { ReminderSettings } from "./ReminderSettings";
import { CustomReminders } from "./CustomReminders";
import { ReminderEditor } from "./ReminderEditor";

export function JobForm({
  data,
  initial,
  existing,
  onSave,
  onClose,
}: {
  data: AppState;
  initial: MockJob;
  existing: boolean;
  onSave: (value: MockJob) => Promise<string | null>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<MockJob>(() => ({
    ...initial,
    currency: initial.currency ?? data.preferences.currency,
    reminderSettings: structuredClone(
      initial.reminderSettings ?? data.preferences.defaultReminders,
    ),
  }));
  const [numbers, setNumbers] = useState(() => jobDraftNumbers(data, initial)),
    [reminder, setReminder] = useState<CustomReminder | null>(null),
    [removeReminder, setRemoveReminder] = useState<CustomReminder | null>(null),
    [confirmedSchedule, setConfirmedSchedule] = useState(false);
  const frozen = jobInProgress(data, initial.id),
    currencyLocked = frozen || jobReferenced(data, initial.id),
    prepared = prepareJobDraft(data, draft, numbers);
  const scheduleChanged = Boolean(
    existing &&
    initial.payFrequency &&
    prepared.job &&
    jobScheduleChanged(initial, prepared.job),
  );
  const form = usePayForm(async () => {
    const result = prepareJobDraft(data, draft, numbers);
    if (result.error) return result.error;
    if (scheduleChanged && !confirmedSchedule)
      return "Confirm the schedule change before saving the job.";
    return result.job ? onSave(result.job) : "Review the job fields.";
  }, onClose);
  const update = (changes: Partial<MockJob>) => {
    setDraft((current) => ({ ...current, ...changes }));
    if ("payFrequency" in changes || "payPeriodStart" in changes)
      setConfirmedSchedule(false);
  };
  const onNumber = (key: keyof JobNumbers, value: string) => {
    setNumbers((current) => ({ ...current, [key]: value }));
    if (key === "payDelayDays") setConfirmedSchedule(false);
  };
  const settings = draft.reminderSettings!;
  const updateSettings = (changes: Partial<JobReminderSettings>) =>
    update({ reminderSettings: { ...settings, ...changes } });
  return (
    <>
      <Modal
        title={existing ? "Edit job" : "Add job"}
        busy={form.saving || Boolean(reminder || removeReminder)}
        onClose={onClose}
      >
        <form onSubmit={form.submit} noValidate>
          <fieldset disabled={form.saving}>
            <Field
              label="Company / job name"
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
            />
            <Field
              label="Role / title"
              value={draft.title ?? ""}
              onChange={(event) => update({ title: event.target.value })}
            />
            <label className="field">
              <span>Notes</span>
              <textarea
                value={draft.notes ?? ""}
                onChange={(event) => update({ notes: event.target.value })}
              />
            </label>
            <div className="field-grid">
              <Field
                label="Hourly rate"
                type="number"
                step="any"
                value={numbers.hourlyRate}
                disabled={frozen}
                onChange={(event) => onNumber("hourlyRate", event.target.value)}
              />
              <label className="field">
                <span>Currency</span>
                <select
                  value={draft.currency}
                  disabled={currencyLocked}
                  onChange={(event) => update({ currency: event.target.value })}
                >
                  {currencies.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              Rate changes apply to future work. Existing entries keep their pay
              rules.
            </p>
            {currencyLocked && (
              <p className="warning">
                Currency is fixed while this job has work, deductions or
                receipts. Use another profile for another currency.
              </p>
            )}
            {frozen && (
              <p className="warning">
                Finish or recover this job’s shift before changing pay or lunch
                defaults. Notes and reminder edits can still be saved.
              </p>
            )}
            <div className="job-form-section">
              <h3>Overtime</h3>
              <p>Blank overrides inherit your saved Tracker defaults.</p>
              <div className="field-grid">
                <Field
                  label="OT After (hrs)"
                  type="number"
                  step="any"
                  value={numbers.overtimeThreshold}
                  disabled={frozen}
                  onChange={(event) =>
                    onNumber("overtimeThreshold", event.target.value)
                  }
                />
                <Field
                  label="OT Multiplier"
                  type="number"
                  step="any"
                  value={numbers.overtimeMultiplier}
                  disabled={frozen}
                  onChange={(event) =>
                    onNumber("overtimeMultiplier", event.target.value)
                  }
                />
              </div>
            </div>
            <JobSchedule
              draft={draft}
              delay={numbers.payDelayDays}
              update={update}
              onDelay={(value) => onNumber("payDelayDays", value)}
            />
            {scheduleChanged && (
              <div className="job-notice">
                <p>
                  Generated period boundaries will change. Received paychecks
                  and shift dates stay unchanged. This job’s saved Pay window
                  will be reset.
                </p>
                <Toggle
                  label="I confirm this pay schedule change"
                  checked={confirmedSchedule}
                  onChange={setConfirmedSchedule}
                />
              </div>
            )}
            <div className="job-form-section">
              <h3>Workday Defaults</h3>
              <Toggle
                label="Include lunch break by default"
                checked={draft.lunchEnabled ?? true}
                disabled={frozen}
                onChange={(lunchEnabled) => update({ lunchEnabled })}
              />
              <Field
                label="Typical lunch break (min)"
                type="number"
                value={numbers.lunchMinutes}
                disabled={frozen || draft.lunchEnabled === false}
                onChange={(event) =>
                  onNumber("lunchMinutes", event.target.value)
                }
              />
              <Toggle
                label="Enable tips at clock-out"
                checked={Boolean(draft.enableTips)}
                onChange={(enableTips) => update({ enableTips })}
              />
            </div>
            <ReminderSettings
              settings={settings}
              numbers={numbers}
              update={updateSettings}
              onNumber={onNumber}
            />
            <CustomReminders
              clockFormat={data.preferences.clockFormat}
              value={settings.custom}
              onChange={(custom) => updateSettings({ custom })}
              onEdit={setReminder}
              onDelete={setRemoveReminder}
            />
            <div className="job-form-section">
              <h3>Label color</h3>
              <div
                className="job-colors"
                role="group"
                aria-label="Job label color"
              >
                {jobColors.map((color, index) => (
                  <button
                    type="button"
                    key={color}
                    style={{ backgroundColor: color }}
                    aria-label={
                      index === 0
                        ? "Theme default color"
                        : `Label color ${color}`
                    }
                    aria-pressed={draft.color === color}
                    onClick={() => update({ color })}
                  >
                    {draft.color === color ? "✓" : ""}
                  </button>
                ))}
              </div>
            </div>
            <Toggle
              label="Make default and select for Tracker"
              checked={Boolean(draft.isDefault)}
              disabled={
                Boolean(initial.isDefault) ||
                (workInProgress(data) && !initial.isDefault)
              }
              onChange={(isDefault) => update({ isDefault })}
            />
            {initial.isDefault && (
              <p>To replace this default, make another job the default.</p>
            )}
          </fieldset>
          <FormFooter {...form} label="Save job" onClose={onClose} />
        </form>
      </Modal>
      {reminder && (
        <ReminderEditor
          key={reminder.id}
          initial={reminder}
          onClose={() => setReminder(null)}
          onUse={(value) => {
            updateSettings({
              custom: settings.custom.some((item) => item.id === value.id)
                ? settings.custom.map((item) =>
                    item.id === value.id ? value : item,
                  )
                : [...settings.custom, value],
            });
            setReminder(null);
          }}
        />
      )}
      {removeReminder && (
        <Confirm
          title="Delete reminder from draft?"
          label="Delete reminder"
          action={async () => {
            updateSettings({
              custom: settings.custom.filter(
                (item) => item.id !== removeReminder.id,
              ),
            });
            return null;
          }}
          onClose={() => setRemoveReminder(null)}
        >
          <p>
            Remove {removeReminder.name} from this draft? Save the job to apply
            the change.
          </p>
        </Confirm>
      )}
    </>
  );
}
