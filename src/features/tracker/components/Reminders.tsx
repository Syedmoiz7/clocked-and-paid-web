"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import { Field, Toggle, Modal } from "@/components/Fields";
import {
  acknowledgeJobReminder,
  setNotificationPermission,
  updateReminders,
} from "@/store/appSlice";
import { alertNextAt } from "@/features/jobs/model";
import {
  workspaceReminderRules,
  nextDueReminder,
} from "@/features/jobs/reminders";
import { primeReminderAudio, playReminderSound } from "@/lib/reminderAudio";
const delivered = new Set<string>();

export function useReminderRules() {
  return workspaceReminderRules(useApp());
}
export function ReminderHost({ now }: { now: number }) {
  const data = useApp(),
    rules = useReminderRules(),
    { commit, busy } = useWorkspace();
  const alert = nextDueReminder(data, rules, now);
  const deliveryKey = alert
    ? `${alert.key}:${alertNextAt(alert, data.jobReminderAcknowledgements)}`
    : null;
  useEffect(() => {
    if (!alert || !deliveryKey || delivered.has(deliveryKey)) return;
    delivered.add(deliveryKey);
    if (delivered.size > 500)
      delivered.delete(delivered.values().next().value!);
    if (alert.settings.sound) playReminderSound();
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification(alert.name, {
          body: alert.message,
          icon: "/branding/icon.png",
          tag: alert.key,
          silent: !alert.settings.sound,
        });
      } catch {
        /* In-page reminder is still available. */
      }
    }
  }, [deliveryKey]);
  useEffect(() => {
    if (!alert?.settings.indicator) return;
    const previous = document.title;
    document.documentElement.dataset.reminderTitle = "active";
    let visible = true;
    const flash = () => {
      document.title = visible ? `Reminder: ${alert.name}` : previous;
      visible = !visible;
    };
    flash();
    const timer = setInterval(flash, 1200);
    return () => {
      clearInterval(timer);
      delete document.documentElement.dataset.reminderTitle;
      document.title = previous;
    };
  }, [alert?.key, alert?.settings.indicator]);
  if (!alert) return null;
  const acknowledge = async (snooze: boolean) => {
    const delay = snooze ? alert.settings.snoozeMinutes : alert.repeatMinutes;
    await commit(
      acknowledgeJobReminder({
        key: alert.key,
        nextAt: delay ? Date.now() + delay * 60000 : -1,
      }),
    );
  };
  const content = (
    <aside className="card reminder-alert" role="status">
      <div>
        <Bell size={18} />
        <h3>{alert.name}</h3>
      </div>
      <p>{alert.message}</p>
      <p>{data.jobs.find((job) => job.id === alert.jobId)?.name}</p>
      <div className="actions">
        <button disabled={busy} onClick={() => void acknowledge(true)}>
          Snooze {alert.settings.snoozeMinutes}m
        </button>
        <button disabled={busy} onClick={() => void acknowledge(false)}>
          Dismiss
        </button>
      </div>
    </aside>
  );
  return alert.settings.overlay ? (
    <Modal
      title={alert.name}
      onClose={() => void acknowledge(false)}
      busy={busy}
    >
      {content}
    </Modal>
  ) : (
    content
  );
}

export function GlobalReminderHost() {
  const data = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!data.activeShift && !data.extraShifts.length) return;
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
  }, [data.activeShift?.id, data.extraShifts.length]);
  useEffect(() => {
    const prime = () => primeReminderAudio();
    window.addEventListener("pointerdown", prime);
    window.addEventListener("keydown", prime);
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);
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
        {data.activeShift || data.extraShifts.length
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
