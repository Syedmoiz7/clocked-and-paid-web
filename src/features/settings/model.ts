import type {
  AppPreferences,
  AppState,
  MockAccount,
  TodayPlan,
} from "../../types";
import {
  currencies,
  reminderDefaults,
  validateJob,
  validTime,
} from "../jobs/model";

export const themeOptions = [
  { label: "Rose", hue: 338 },
  { label: "Red", hue: 4 },
  { label: "Orange", hue: 25 },
  { label: "Amber", hue: 40 },
  { label: "Lime", hue: 80 },
  { label: "Green", hue: 145 },
  { label: "Teal", hue: 175 },
  { label: "Cyan", hue: 195 },
  { label: "Blue", hue: 220 },
  { label: "Indigo", hue: 250 },
  { label: "Violet", hue: 270 },
  { label: "Purple", hue: 285 },
];
export function preferenceDefaults(): AppPreferences {
  return {
    enableManualEditing: true,
    allowConcurrentShifts: false,
    showDailyQuote: true,
    clockFormat: "12h",
    typicalStartTime: "",
    payHiddenByDefault: true,
    headerTimerMode: "count-up",
    themeHue: 338,
    currency: "USD",
    defaultReminders: { ...reminderDefaults(), lunchMode: "relative" },
  };
}
export type SettingsDraft = {
  preferences: AppPreferences;
  plan: TodayPlan;
  breakIncluded: boolean;
};
export function settingsDraft(data: AppState): SettingsDraft {
  return {
    preferences: data.preferences,
    plan: data.defaultPlan,
    breakIncluded: data.breakIncludedInRemaining,
  };
}
export function validateSettings(draft: SettingsDraft): string | null {
  const p = draft.preferences,
    plan = draft.plan;
  if (
    typeof plan.lunchEnabled !== "boolean" ||
    typeof draft.breakIncluded !== "boolean"
  )
    return "Invalid workday flag.";
  if (
    !["duration", "end-time"].includes(plan.planningMode) ||
    (plan.plannedClockOut != null && !validTime(plan.plannedClockOut))
  )
    return "Invalid planning mode or clock-out time.";
  if (
    !Number.isFinite(plan.plannedHours) ||
    plan.plannedHours <= 0 ||
    plan.plannedHours > 24
  )
    return "Typical work hours must be greater than 0 and at most 24.";
  if (
    !Number.isInteger(plan.lunchMinutes) ||
    plan.lunchMinutes < (plan.lunchEnabled ? 5 : 0) ||
    plan.lunchMinutes > 120
  )
    return "Lunch duration must be 5–120 whole minutes when enabled (0 is allowed when disabled).";
  if (p.typicalStartTime && !validTime(p.typicalStartTime))
    return "Choose a valid typical start time.";
  if (!currencies.includes(p.currency)) return "Choose a supported currency.";
  if (!["12h", "24h"].includes(p.clockFormat)) return "Choose a clock format.";
  if (
    !["count-up", "count-down"].includes(plan.timerDirection) ||
    !["off", "count-up", "count-down"].includes(p.headerTimerMode)
  )
    return "Choose a valid timer direction.";
  if (!themeOptions.some((option) => option.hue === p.themeHue))
    return "Choose a supported theme color.";
  for (const key of [
    "enableManualEditing",
    "allowConcurrentShifts",
    "showDailyQuote",
    "payHiddenByDefault",
  ] as const)
    if (typeof p[key] !== "boolean") return "Invalid preference value.";
  return validateJob({
    id: "settings",
    name: "Defaults",
    color: "#d65c90",
    hourlyRate: plan.hourlyRate,
    overtimeThreshold: plan.overtimeThreshold,
    overtimeMultiplier: plan.overtimeMultiplier,
    lunchMinutes: plan.lunchMinutes,
    reminderSettings: p.defaultReminders,
    currency: p.currency,
  });
}
export function validateAccount(account: MockAccount) {
  if (!account.name.trim()) return "Enter a display name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email.trim()))
    return "Enter a valid email address.";
  return null;
}
export function prepareAccountUpdate(
  current: MockAccount,
  changes: Partial<Pick<MockAccount, "name" | "email">>,
): { account: MockAccount; error: null } | { error: string; account?: never } {
  if (current.mode !== "mock")
    return { error: "Sign in with mock data before changing the profile." };
  const account = {
    ...current,
    ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
    ...(changes.email !== undefined ? { email: changes.email.trim() } : {}),
  };
  if (!account.name) return { error: "Enter a display name." };
  if (changes.email !== undefined) {
    const error = validateAccount(account);
    if (error) return { error };
  }
  return { account, error: null };
}
export function rebaseAccountDraft(
  local: MockAccount,
  before: MockAccount,
  latest: MockAccount,
): MockAccount {
  return local.mode !== latest.mode
    ? latest
    : {
        ...latest,
        name: local.name === before.name ? latest.name : local.name,
        email: local.email === before.email ? latest.email : local.email,
      };
}
export function validatePassword(password: string, confirmation: string) {
  if (password.length < 6 || !password.trim())
    return "Password must be at least 6 characters.";
  return password === confirmation ? null : "Passwords don't match.";
}
export function validateLockCredential(
  type: "pin4" | "pin6" | "password",
  value: string,
) {
  if (type === "pin4" || type === "pin6")
    return new RegExp(`^\\d{${type === "pin4" ? 4 : 6}}$`).test(value)
      ? null
      : `Enter exactly ${type === "pin4" ? 4 : 6} digits.`;
  return value.length >= 6 && value.trim()
    ? null
    : "Use at least 6 characters.";
}
export function clockLabel(
  value: string,
  format: AppPreferences["clockFormat"],
) {
  if (!validTime(value)) return "—";
  const [h, m] = value.split(":").map(Number);
  return format === "24h"
    ? value
    : `${h! % 12 || 12}:${String(m).padStart(2, "0")} ${h! >= 12 ? "PM" : "AM"}`;
}
export function typicalShift(draft: SettingsDraft) {
  if (
    !Number.isFinite(draft.plan.plannedHours) ||
    draft.plan.plannedHours <= 0 ||
    draft.plan.plannedHours > 24 ||
    (draft.plan.lunchEnabled && !Number.isFinite(draft.plan.lunchMinutes))
  )
    return "Enter valid hours and lunch duration for a preview.";
  const start = draft.preferences.typicalStartTime;
  if (!validTime(start)) return "Set a typical start time for a preview.";
  const [h, m] = start.split(":").map(Number);
  const total =
    h! * 60 +
    m! +
    Math.round(draft.plan.plannedHours * 60) +
    (draft.plan.lunchEnabled ? draft.plan.lunchMinutes : 0);
  const end = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  const days = Math.floor(total / 1440);
  return `${clockLabel(start, draft.preferences.clockFormat)} → ${clockLabel(end, draft.preferences.clockFormat)}${days ? ` (+${days} ${days === 1 ? "day" : "days"})` : ""}`;
}
