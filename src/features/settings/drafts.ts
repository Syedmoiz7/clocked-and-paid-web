import type { AppState, Shift } from "../../types";
import { settingsDraft, validateSettings, type SettingsDraft } from "./model";

export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a),
    right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(
      (key) =>
        Object.hasOwn(b, key) && sameValue((a as any)[key], (b as any)[key]),
    )
  );
}
function rebase(local: any, base: any, latest: any): any {
  if (sameValue(local, base)) return latest;
  if (
    !local ||
    !base ||
    !latest ||
    typeof local !== "object" ||
    Array.isArray(local)
  )
    return local;
  return Object.fromEntries(
    Object.keys(latest).map((key) => [
      key,
      rebase(local[key], base[key], latest[key]),
    ]),
  );
}
export function rebaseSettingsDraft(
  local: SettingsDraft,
  base: SettingsDraft,
  latest: SettingsDraft,
): SettingsDraft {
  const result = rebase(local, base, latest) as SettingsDraft;
  return {
    ...result,
    preferences: {
      ...result.preferences,
      themeHue: latest.preferences.themeHue,
    },
  };
}
export function prepareSettingsSave(
  data: AppState,
  local: SettingsDraft,
  base: SettingsDraft,
) {
  const draft = rebaseSettingsDraft(local, base, settingsDraft(data));
  const fallback = data.preferences.defaultReminders;
  const reminders = draft.preferences.defaultReminders;
  const plan = { ...draft.plan };
  if (
    !plan.lunchEnabled &&
    (!Number.isInteger(plan.lunchMinutes) ||
      plan.lunchMinutes < 0 ||
      plan.lunchMinutes > 120)
  )
    plan.lunchMinutes =
      Number.isInteger(data.defaultPlan.lunchMinutes) &&
      data.defaultPlan.lunchMinutes >= 0 &&
      data.defaultPlan.lunchMinutes <= 120
        ? data.defaultPlan.lunchMinutes
        : 30;
  const next = {
    ...draft,
    plan,
    preferences: {
      ...draft.preferences,
      defaultReminders: {
        ...reminders,
        lunchHours:
          reminders.lunchMode === "relative"
            ? reminders.lunchHours
            : Number.isFinite(reminders.lunchHours) &&
                reminders.lunchHours >= 0.5 &&
                reminders.lunchHours <= 12
              ? reminders.lunchHours
              : fallback.lunchHours,
        snoozeMinutes: reminders.overlay
          ? reminders.snoozeMinutes
          : Number.isInteger(reminders.snoozeMinutes) &&
              reminders.snoozeMinutes >= 1 &&
              reminders.snoozeMinutes <= 60
            ? reminders.snoozeMinutes
            : fallback.snoozeMinutes,
      },
    },
  };
  return { draft: next, error: validateSettings(next) };
}

// Materialize missing monetary rules before changing global fallback values.
export function preserveWorkspacePricing(data: AppState): AppState {
  const snapshot = (entry: Shift): Shift => {
    const job = data.jobs.find((item) => item.id === entry.jobId);
    const fallback =
      entry.id === data.activeShift?.id ? data.todayPlan : data.defaultPlan;
    return {
      ...entry,
      currency: entry.currency ?? job?.currency ?? data.preferences.currency,
      ...(entry.entryType === "project"
        ? {}
        : {
            customRate:
              entry.customRate ?? job?.hourlyRate ?? fallback.hourlyRate,
            overtimeThreshold:
              entry.overtimeThreshold ??
              job?.overtimeThreshold ??
              fallback.overtimeThreshold,
            overtimeMultiplier:
              entry.overtimeMultiplier ??
              job?.overtimeMultiplier ??
              fallback.overtimeMultiplier,
          }),
    };
  };
  return {
    ...data,
    history: data.history.map(snapshot),
    activeShift: data.activeShift ? snapshot(data.activeShift) : null,
    extraShifts: data.extraShifts.map(snapshot),
    orphanedShift: data.orphanedShift ? snapshot(data.orphanedShift) : null,
    jobs: data.jobs.map((job) => ({
      ...job,
      currency: job.currency ?? data.preferences.currency,
    })),
    deductions: data.deductions.map((item) =>
      item.isPercentage
        ? item
        : {
            ...item,
            currency:
              item.currency ??
              data.jobs.find((job) => job.id === item.jobId)?.currency ??
              data.preferences.currency,
          },
    ),
    paychecks: data.paychecks.map((item) => ({
      ...item,
      currency:
        item.currency ??
        data.jobs.find((job) => job.id === item.jobId)?.currency ??
        data.preferences.currency,
    })),
  };
}
