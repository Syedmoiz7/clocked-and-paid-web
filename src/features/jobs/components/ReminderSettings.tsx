"use client";
import { Field, Toggle } from "@/components/Fields";
import type { JobReminderSettings, MockJob } from "@/types";
import type { JobNumbers } from "../model";

export function ReminderSettings({
  settings,
  numbers,
  update,
  onNumber,
}: {
  settings: JobReminderSettings;
  numbers: JobNumbers;
  update: (value: Partial<JobReminderSettings>) => void;
  onNumber: (key: keyof JobNumbers, value: string) => void;
}) {
  return (
    <div className="job-form-section">
      <h3>Reminders</h3>
      <p>
        Keep a browser tab open for reminders. Browser sound and system
        notifications depend on permission and browser support.
      </p>
      <label className="field">
        <span>Lunch break reminder</span>
        <select
          value={settings.lunchMode}
          onChange={(event) =>
            update({
              lunchMode: event.target.value as JobReminderSettings["lunchMode"],
            })
          }
        >
          <option value="off">Off</option>
          <option value="relative">After hours</option>
          <option value="fixed">Fixed time</option>
        </select>
      </label>
      {settings.lunchMode === "relative" && (
        <Field
          label="Hours after clock-in"
          type="number"
          step="any"
          value={numbers.lunchHours}
          onChange={(event) => onNumber("lunchHours", event.target.value)}
        />
      )}
      {settings.lunchMode === "fixed" && (
        <Field
          label="Remind me at"
          type="time"
          value={settings.lunchTime}
          onChange={(event) => update({ lunchTime: event.target.value })}
        />
      )}
      <Toggle
        label="Remind me when lunch ends"
        checked={settings.returnReminder}
        onChange={(returnReminder) => update({ returnReminder })}
      />
      <Field
        label="Re-fire after (min; 0 = no repeat)"
        type="number"
        value={numbers.repeatMinutes}
        onChange={(event) => onNumber("repeatMinutes", event.target.value)}
      />
      <Toggle
        label="Sound alert"
        checked={settings.sound}
        onChange={(sound) => update({ sound })}
      />
      <Toggle
        label="Browser title alert indicator"
        checked={settings.indicator}
        onChange={(indicator) => update({ indicator })}
      />
      <Toggle
        label="Reminder overlay"
        checked={settings.overlay}
        onChange={(overlay) => update({ overlay })}
      />
      {settings.overlay && (
        <Field
          label="Default snooze (minutes)"
          type="number"
          value={numbers.snoozeMinutes}
          onChange={(event) => onNumber("snoozeMinutes", event.target.value)}
        />
      )}
    </div>
  );
}
