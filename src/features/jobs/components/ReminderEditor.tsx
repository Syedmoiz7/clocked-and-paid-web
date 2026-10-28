"use client";
import { useState } from "react";
import { Field, Modal, Toggle } from "@/components/Fields";
import type { CustomReminder } from "@/types";
import { prepareReminderDraft } from "../model";

export function ReminderEditor({
  initial,
  onUse,
  onClose,
}: {
  initial: CustomReminder;
  onUse: (value: CustomReminder) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [offset, setOffset] = useState(String(initial.offsetMinutes)),
    [repeat, setRepeat] = useState(String(initial.repeatMinutes || 10)),
    [error, setError] = useState<string | null>(null);
  const update = (changes: Partial<CustomReminder>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setError(null);
  };
  return (
    <Modal title="Reminder draft" onClose={onClose}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const result = prepareReminderDraft(draft, offset, repeat);
          if (result.error) setError(result.error);
          else if (result.reminder) onUse(result.reminder);
        }}
      >
        <fieldset>
          <p>
            Use this reminder in the job draft, then save the job to activate
            it. Cancelling the job discards these changes.
          </p>
          <Field
            label="Reminder name"
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
          />
          <Field
            label="Message (optional)"
            value={draft.message}
            onChange={(event) => update({ message: event.target.value })}
          />
          <label className="field">
            <span>When to fire</span>
            <select
              value={draft.trigger}
              onChange={(event) =>
                update({
                  trigger: event.target.value as CustomReminder["trigger"],
                })
              }
            >
              <option value="after-clock-in">After clock-in</option>
              <option value="after-lunch-start">After lunch starts</option>
              <option value="at-time">At a specific time</option>
            </select>
          </label>
          {draft.trigger === "at-time" ? (
            <Field
              label="Reminder time"
              type="time"
              value={draft.atTime}
              onChange={(event) => update({ atTime: event.target.value })}
            />
          ) : (
            <Field
              label="Minutes after trigger (1–480)"
              type="number"
              value={offset}
              onChange={(event) => setOffset(event.target.value)}
            />
          )}
          <Toggle
            label="Repeat reminder"
            checked={draft.repeatMinutes > 0}
            onChange={(enabled) => update({ repeatMinutes: enabled ? 10 : 0 })}
          />
          {draft.repeatMinutes > 0 && (
            <Field
              label="Repeat interval (minutes)"
              type="number"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
            />
          )}
          <label className="field">
            <span>Priority</span>
            <select
              value={draft.priority}
              onChange={(event) =>
                update({
                  priority: event.target.value as CustomReminder["priority"],
                })
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <footer className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel reminder
          </button>
          <button type="submit" className="primary">
            Use reminder in job draft
          </button>
        </footer>
      </form>
    </Modal>
  );
}
