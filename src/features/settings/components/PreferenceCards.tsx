"use client";
import { Field, Panel, Toggle } from "@/components/Fields";
import type { SettingsDraft } from "../model";
import { typicalShift } from "../model";
import { CustomReminders } from "@/features/jobs/components/CustomReminders";
import { ReminderEditor } from "@/features/jobs/components/ReminderEditor";
import { Confirm } from "@/features/pay/components/Shared";
import type { CustomReminder } from "@/types";
import { useState } from "react";

export function PreferenceCards({
  draft,
  onChange,
  disabled,
  premium,
  onPremium,
}: {
  draft: SettingsDraft;
  onChange: (value: SettingsDraft) => void;
  disabled: boolean;
  premium: boolean;
  onPremium: () => void;
}) {
  const prefs = draft.preferences,
    plan = draft.plan,
    reminders = prefs.defaultReminders;
  const [editing, setEditing] = useState<CustomReminder | null>(null),
    [removing, setRemoving] = useState<CustomReminder | null>(null);
  const update = (changes: Partial<typeof prefs>) =>
      onChange({ ...draft, preferences: { ...prefs, ...changes } }),
    updatePlan = (changes: Partial<typeof plan>) =>
      onChange({ ...draft, plan: { ...plan, ...changes } }),
    reminder = (changes: Partial<typeof reminders>) =>
      update({ defaultReminders: { ...reminders, ...changes } });
  const numeric = (
    label: string,
    value: number,
    change: (value: number) => void,
    inactive = false,
  ) => (
    <Field
      label={label}
      type="number"
      step="any"
      disabled={disabled || inactive}
      value={Number.isFinite(value) ? value : ""}
      onChange={(event) =>
        change(event.target.value.trim() ? Number(event.target.value) : NaN)
      }
    />
  );
  return (
    <>
      <Panel
        title="Workday Defaults"
        subtitle="Used for planning and calculators. Job-specific rules take priority; running plans are kept."
      >
        <fieldset className="form-stack" disabled={disabled}>
          <div className="chips" aria-label="Typical hours">
            {[6, 8, 10, 12].map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={plan.plannedHours === value}
                onClick={() => updatePlan({ plannedHours: value })}
              >
                {value} hrs
              </button>
            ))}
          </div>
          {numeric(
            "Typical work hours (up to 24)",
            plan.plannedHours,
            (plannedHours) => updatePlan({ plannedHours }),
          )}
          <Toggle
            label="Include lunch by default"
            checked={plan.lunchEnabled}
            onChange={(lunchEnabled) => updatePlan({ lunchEnabled })}
          />
          {numeric(
            "Default lunch duration (min)",
            plan.lunchMinutes,
            (lunchMinutes) => updatePlan({ lunchMinutes }),
            !plan.lunchEnabled,
          )}
          <Field
            label="Typical start time (reference only)"
            type="time"
            value={prefs.typicalStartTime}
            onChange={(event) =>
              update({ typicalStartTime: event.target.value })
            }
          />
          {prefs.typicalStartTime && (
            <button
              type="button"
              onClick={() => update({ typicalStartTime: "" })}
            >
              Clear typical start time
            </button>
          )}
          <p>{typicalShift(draft)}</p>
          <Toggle
            label="Include break in time remaining"
            checked={draft.breakIncluded}
            onChange={(breakIncluded) => onChange({ ...draft, breakIncluded })}
          />
          <div className="job-form-section">
            <h3>Default Reminders</h3>
            <p>
              Used when a job has no reminder overrides. Edit job-specific rules
              in Jobs. Keep this browser tab open for delivery.
            </p>
            <label className="field">
              <span>Default lunch reminder</span>
              <select
                value={reminders.lunchMode}
                onChange={(event) =>
                  reminder({
                    lunchMode: event.target.value as typeof reminders.lunchMode,
                  })
                }
              >
                <option value="off">Off</option>
                <option value="relative">After clock-in</option>
                <option value="fixed">At a fixed time</option>
              </select>
            </label>
            {reminders.lunchMode === "relative" &&
              numeric(
                "Hours since clock-in (includes pauses)",
                reminders.lunchHours,
                (lunchHours) => reminder({ lunchHours }),
              )}
            {reminders.lunchMode === "fixed" && (
              <Field
                label="Lunch reminder time"
                type="time"
                value={reminders.lunchTime}
                onChange={(event) =>
                  reminder({ lunchTime: event.target.value })
                }
              />
            )}
            <Toggle
              label="Return-to-Work Reminder"
              checked={reminders.returnReminder}
              onChange={(returnReminder) => reminder({ returnReminder })}
            />
            {numeric(
              "Re-fire interval (min; 0 = off)",
              reminders.repeatMinutes,
              (repeatMinutes) => reminder({ repeatMinutes }),
            )}
            {numeric(
              "Snooze duration (min)",
              reminders.snoozeMinutes,
              (snoozeMinutes) => reminder({ snoozeMinutes }),
              !reminders.overlay,
            )}
            <Toggle
              label="Reminder sound"
              checked={reminders.sound}
              onChange={(sound) => reminder({ sound })}
            />
            <Toggle
              label="Reminder overlay"
              checked={reminders.overlay}
              onChange={(overlay) => reminder({ overlay })}
            />
            <Toggle
              label="Reminder title indicator"
              checked={reminders.indicator}
              onChange={(indicator) => reminder({ indicator })}
            />
          </div>
          <CustomReminders
            target="defaults"
            clockFormat={prefs.clockFormat}
            value={reminders.custom}
            onChange={(custom) => reminder({ custom })}
            onEdit={setEditing}
            onDelete={setRemoving}
          />
        </fieldset>
      </Panel>
      <Panel
        title="Preferences"
        subtitle="Changes apply when you save. Use the header eye button for temporary pay visibility."
      >
        <fieldset className="form-stack" disabled={disabled}>
          <Toggle
            label="Manual Time Editing"
            checked={prefs.enableManualEditing}
            onChange={(enableManualEditing) => update({ enableManualEditing })}
          />
          <Toggle
            label="Daily Motivational Quote"
            checked={prefs.showDailyQuote}
            onChange={(showDailyQuote) => update({ showDailyQuote })}
          />
          <Toggle
            label="Allow concurrent jobs (Premium)"
            checked={prefs.allowConcurrentShifts}
            onChange={(allowConcurrentShifts) =>
              allowConcurrentShifts && !premium
                ? onPremium()
                : update({ allowConcurrentShifts })
            }
          />
          <Toggle
            label="Hide pay by default"
            checked={prefs.payHiddenByDefault}
            onChange={(payHiddenByDefault) => update({ payHiddenByDefault })}
          />
          <label className="field">
            <span>Clock Format</span>
            <select
              value={prefs.clockFormat}
              onChange={(event) =>
                update({
                  clockFormat: event.target.value as typeof prefs.clockFormat,
                })
              }
            >
              <option value="12h">12-Hour · 9:30 AM</option>
              <option value="24h">24-Hour · 09:30</option>
            </select>
          </label>
          <label className="field">
            <span>Shift Timer Direction</span>
            <select
              value={plan.timerDirection}
              onChange={(event) =>
                updatePlan({
                  timerDirection: event.target
                    .value as typeof plan.timerDirection,
                })
              }
            >
              <option value="count-up">Count Up</option>
              <option value="count-down">Count Down</option>
            </select>
          </label>
          <label className="field">
            <span>Browser Tab Time</span>
            <select
              value={prefs.headerTimerMode}
              onChange={(event) =>
                update({
                  headerTimerMode: event.target
                    .value as typeof prefs.headerTimerMode,
                })
              }
            >
              <option value="count-up">Count Up</option>
              <option value="count-down">Count Down</option>
              <option value="off">Off</option>
            </select>
          </label>
        </fieldset>
      </Panel>
      {editing && (
        <ReminderEditor
          target="defaults"
          initial={editing}
          onClose={() => setEditing(null)}
          onUse={(item) => {
            reminder({
              custom: reminders.custom.some((value) => value.id === item.id)
                ? reminders.custom.map((value) =>
                    value.id === item.id ? item : value,
                  )
                : [...reminders.custom, item],
            });
            setEditing(null);
          }}
        />
      )}
      {removing && (
        <Confirm
          title="Remove default reminder?"
          label="Remove reminder"
          onClose={() => setRemoving(null)}
          action={async () => {
            reminder({
              custom: reminders.custom.filter(
                (item) => item.id !== removing.id,
              ),
            });
            return null;
          }}
        >
          <p>Remove {removing.name} from the draft? Save Changes to apply.</p>
        </Confirm>
      )}
    </>
  );
}
