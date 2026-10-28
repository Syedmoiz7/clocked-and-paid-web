import type { AppState } from "@/types";
import { jobAlerts, alertNextAt, type JobAlert } from "./model";

export function workspaceReminderRules(data: AppState): JobAlert[] {
  const shifts = [data.activeShift, ...data.extraShifts].filter(
    (shift): shift is NonNullable<typeof shift> => Boolean(shift),
  );
  return shifts.flatMap((shift) => {
    const primary = shift.id === data.activeShift?.id;
    const job = data.jobs.find(
      (job) =>
        job.id === (shift.jobId ?? (primary ? data.selectedJobId : undefined)),
    );
    if (!job) return [];
    const base = job.reminderSettings ?? data.preferences.defaultReminders;
    const settings = primary
      ? {
          ...base,
          lunchMode: data.reminders.lunchReminder
            ? base.lunchMode === "off"
              ? ("relative" as const)
              : base.lunchMode
            : ("off" as const),
          returnReminder: data.reminders.returnReminder,
          snoozeMinutes: data.reminders.reminderSnoozeMinutes,
          sound: data.reminders.reminderSound,
          indicator: data.reminders.reminderTabFlash,
          overlay: data.reminders.reminderOverlay,
        }
      : base;
    const rules = jobAlerts(shift, {
      ...job,
      lunchEnabled: primary ? data.todayPlan.lunchEnabled : job.lunchEnabled,
      lunchMinutes: primary ? data.todayPlan.lunchMinutes : job.lunchMinutes,
      reminderSettings: settings,
    });
    if (primary && data.reminders.customReminderMinutes)
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
  });
}
export function nextDueReminder(
  data: AppState,
  rules: JobAlert[],
  now: number,
) {
  const rank = { high: 0, medium: 1, low: 2 };
  return (
    rules
      .filter((rule) => {
        const at = alertNextAt(rule, data.jobReminderAcknowledgements);
        return at != null && at <= now;
      })
      .sort(
        (a, b) =>
          rank[a.priority] - rank[b.priority] ||
          (alertNextAt(a, data.jobReminderAcknowledgements) ?? a.at) -
            (alertNextAt(b, data.jobReminderAcknowledgements) ?? b.at),
      )[0] ?? null
  );
}
