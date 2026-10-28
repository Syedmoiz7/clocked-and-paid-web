"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import { Field, Toggle } from "@/components/Fields";
import {
  acknowledgeJobReminder,
  setNotificationPermission,
  updateReminders,
} from "@/store/appSlice";
import { jobAlerts, type JobAlert } from "@/features/jobs/model";

export function useReminderRules() {
  const data = useApp();
  const shift = data.activeShift;
  const job = data.jobs.find(
    (item) => item.id === (shift?.jobId ?? data.selectedJobId),
  );
  if (!shift || !job) return [];
  const base = job.reminderSettings ?? data.preferences.defaultReminders;
  const settings = {
    ...base,
    lunchMode: data.reminders.lunchReminder
      ? base.lunchMode === "off"
        ? ("relative" as const)
        : base.lunchMode
      : ("off" as const),
    returnReminder: data.reminders.returnReminder,
    snoozeMinutes: data.reminders.reminderSnoozeMinutes,
  };
  const rules = jobAlerts(shift, {
    ...job,
    lunchEnabled: data.todayPlan.lunchEnabled,
    lunchMinutes: data.todayPlan.lunchMinutes,
    reminderSettings: settings,
  });
  if (data.reminders.customReminderMinutes)
    rules.push({
      key: `${shift.id}:session-custom`,
      jobId: job.id,
      shiftId: shift.id,
      name: "Shift reminder",
      message: "Your custom shift reminder is due.",
      at:
        Date.parse(shift.startedAt) +
        data.reminders.customReminderMinutes * 60000,
      repeatMinutes: 0,
      priority: "medium",
      settings,
    });
  return rules;
}
export function ReminderHost({ now }: { now: number }) {
  const data = useApp(),
    rules = useReminderRules(),
    { commit, busy } = useWorkspace();
  const [alert, setAlert] = useState<JobAlert | null>(null);
  const due = rules.find(
    (rule) => (data.jobReminderAcknowledgements[rule.key] ?? rule.at) <= now,
  );
  useEffect(() => {
    if (alert && !rules.some((rule) => rule.key === alert.key)) {
      setAlert(null);
      return;
    }
    if (!due || alert) return;
    setAlert(due);
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification(due.name, {
          body: due.message,
          icon: "/branding/icon.png",
          tag: due.key,
        });
      } catch {
        /* In-page alert remains available where notifications are unsupported. */
      }
    }
  }, [due?.key, alert]);
  if (!alert || !rules.some((rule) => rule.key === alert.key)) return null;
  const acknowledge = async (snooze: boolean) => {
    const delay = snooze
      ? data.reminders.reminderSnoozeMinutes
      : alert.repeatMinutes;
    if (
      await commit(
        acknowledgeJobReminder({
          key: alert.key,
          nextAt: delay ? Date.now() + delay * 60000 : Number.MAX_SAFE_INTEGER,
        }),
      )
    )
      setAlert(null);
  };
  return (
    <aside className="card reminder-alert" role="status">
      <div>
        <Bell size={18} />
        <h3>{alert.name}</h3>
      </div>
      <p>{alert.message}</p>
      <div className="actions">
        <button disabled={busy} onClick={() => void acknowledge(true)}>
          Snooze {data.reminders.reminderSnoozeMinutes}m
        </button>
        <button disabled={busy} onClick={() => void acknowledge(false)}>
          Dismiss
        </button>
      </div>
    </aside>
  );
}

export function GlobalReminderHost() {
  const data = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!data.activeShift) return;
    const tick = () => setNow(Date.now()),
      timer = setInterval(tick, 1000);
    tick();
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [data.activeShift?.id]);
  return <ReminderHost now={now} />;
}
export function Reminders() {
  const data = useApp(),
    { commit, busy, notify } = useWorkspace(),
    rules = useReminderRules();
  const [permission, setPermission] = useState<
    NotificationPermission | "unavailable"
  >("default");
  useEffect(() => {
    setPermission(
      typeof Notification === "undefined"
        ? "unavailable"
        : Notification.permission,
    );
  }, []);
  const request = async () => {
    if (typeof Notification === "undefined") {
      notify(
        "This browser does not support notifications. In-page reminders remain available.",
      );
      return;
    }
    const status = await Notification.requestPermission();
    setPermission(status);
    await commit(setNotificationPermission(status));
  };
  return (
    <fieldset disabled={busy} className="form-stack">
      <p>
        Keep this browser tab open for reminders. Delivery while the browser is
        closed is unavailable.
      </p>
      <p>
        {data.activeShift
          ? `${rules.length} reminder rule(s) for this shift.`
          : "Clock in to start reminders."}{" "}
        Browser notifications: {permission}.
      </p>
      {permission === "default" && (
        <button onClick={() => void request()}>
          Allow browser notifications
        </button>
      )}
      {permission === "denied" && (
        <small>
          Enable notifications in this site's browser settings. In-page
          reminders still work.
        </small>
      )}
      {rules.map((rule) => (
        <small key={rule.key}>
          {rule.name} ·{" "}
          {new Date(rule.at).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </small>
      ))}
      <Toggle
        label="Lunch reminder"
        checked={data.reminders.lunchReminder}
        onChange={(lunchReminder) =>
          void commit(updateReminders({ lunchReminder }))
        }
      />
      <Toggle
        label="Return-to-work reminder"
        checked={data.reminders.returnReminder}
        onChange={(returnReminder) =>
          void commit(updateReminders({ returnReminder }))
        }
      />
      <Field
        label="Reminder after clock-in (minutes, optional)"
        type="number"
        min="1"
        max="1440"
        defaultValue={data.reminders.customReminderMinutes ?? ""}
        key={`custom-${data.activeShift?.id ?? "idle"}`}
        onBlur={(e) => {
          const value = e.target.value;
          if (!value || (Number(value) > 0 && Number(value) <= 1440))
            void commit(
              updateReminders({
                customReminderMinutes: value ? Number(value) : null,
              }),
            );
          else
            notify("Use 1–1440 minutes, or leave the custom reminder blank.");
        }}
      />
      <Field
        label="Snooze duration (minutes)"
        type="number"
        min="1"
        max="120"
        defaultValue={data.reminders.reminderSnoozeMinutes}
        onBlur={(e) => {
          const value = Number(e.target.value);
          if (Number.isInteger(value) && value >= 1 && value <= 120)
            void commit(updateReminders({ reminderSnoozeMinutes: value }));
          else notify("Snooze must be 1–120 minutes.");
        }}
      />
      <small>
        {data.jobs.find((job) => job.id === data.selectedJobId)
          ?.reminderSettings
          ? "Changes also update this job's reminder rules."
          : "These tracking-session overrides do not change global defaults."}
      </small>
    </fieldset>
  );
}
