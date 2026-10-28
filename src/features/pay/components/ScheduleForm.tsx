"use client";
import { useState } from "react";
import { Field, Modal, Toggle } from "@/components/Fields";
import { editSchedule, frequencies, validateSchedule } from "../model";
import type { PaySchedule } from "@/types";
import { FormFooter, usePayForm } from "./Shared";

export function ScheduleForm({
  initial,
  jobId,
  onSave,
  onClose,
}: {
  initial: PaySchedule;
  jobId: string | null;
  onSave: (schedule: PaySchedule, apply: boolean) => Promise<string | null>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial),
    [apply, setApply] = useState(Boolean(jobId));
  const form = usePayForm(
    () =>
      Promise.resolve(
        validateSchedule(draft) ?? onSave(draft, apply && !draft.customPeriod),
      ),
    onClose,
  );
  return (
    <Modal title="Pay schedule" onClose={onClose} busy={form.saving}>
      <form onSubmit={form.submit} noValidate>
        <fieldset disabled={form.saving}>
          <label className="field">
            <span>Pay frequency</span>
            <select
              value={draft.frequency}
              onChange={(event) =>
                setDraft(editSchedule(draft, "frequency", event.target.value))
              }
            >
              {frequencies.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field-grid">
            <Field
              label="Period start"
              type="date"
              value={draft.periodStart}
              onChange={(event) =>
                setDraft(editSchedule(draft, "periodStart", event.target.value))
              }
            />
            <Field
              label="Period end"
              type="date"
              value={draft.periodEnd}
              onChange={(event) =>
                setDraft(editSchedule(draft, "periodEnd", event.target.value))
              }
            />
          </div>
          <p>
            Changing the frequency or start rebuilds the period end and expected
            pay date. A custom end keeps the selected length when navigating.
          </p>
          <Field
            label="Pay date"
            type="date"
            value={draft.payDate}
            onChange={(event) =>
              setDraft(editSchedule(draft, "payDate", event.target.value))
            }
          />
          {jobId && !draft.customPeriod && (
            <Toggle
              label="Use for this job’s paycheck schedule"
              checked={apply}
              onChange={setApply}
            />
          )}
          {jobId && draft.customPeriod && (
            <p>
              This custom window is saved for Pay only. The job’s recurring
              schedule stays unchanged.
            </p>
          )}
        </fieldset>
        <FormFooter {...form} label="Save schedule" onClose={onClose} />
      </form>
    </Modal>
  );
}
