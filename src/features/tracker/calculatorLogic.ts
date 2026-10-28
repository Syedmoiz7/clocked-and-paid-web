import type { Deduction, MockJob, TodayPlan } from "../../types";
import { localDate, wagesFor } from "../history/model";
import type { CalculatorDraft } from "./model";

export function calculatorDefaults(defaults: TodayPlan): CalculatorDraft {
  return {
    mode: "hours",
    start: "",
    end: "",
    hours: String(defaults.plannedHours),
    lunchEnabled: defaults.lunchEnabled,
    lunchMinutes: String(defaults.lunchMinutes),
  };
}
// These transitions are the only way input methods change: no stale time or
// preset can contribute to the active calculation.
export function selectCalculatorHours(
  draft: CalculatorDraft,
  hours: string,
): CalculatorDraft {
  return { ...draft, mode: "hours", hours, start: "", end: "" };
}
export function selectCalculatorTime(
  draft: CalculatorDraft,
  field: "start" | "end",
  value: string,
): CalculatorDraft {
  return {
    ...draft,
    mode: "times",
    hours: "",
    start: draft.mode === "times" ? draft.start : "",
    end: draft.mode === "times" ? draft.end : "",
    [field]: value,
  };
}
export function calculatorHourOptions(defaultHours: number) {
  const standard = [6, 7, 8, 9, 10, 12];
  return Number.isFinite(defaultHours) &&
    defaultHours > 0 &&
    defaultHours <= 24 &&
    !standard.includes(defaultHours)
    ? [...standard, defaultHours].sort((a, b) => a - b)
    : standard;
}
// A pay profile consistently chooses rate, overtime, currency and daily deductions.
// Global flat deductions have the global currency; percentages are currency-neutral.
export function calculatorPay(
  hours: number,
  defaults: TodayPlan,
  jobs: MockJob[],
  deductions: Deduction[],
  globalCurrency: string,
  jobId: string | null,
  date = localDate(),
) {
  const job = jobs.find((job) => job.id === jobId && !job.archived);
  const currency = job?.currency ?? globalCurrency;
  const plan = {
    ...defaults,
    hourlyRate: job?.hourlyRate ?? defaults.hourlyRate,
    overtimeThreshold: job?.overtimeThreshold ?? defaults.overtimeThreshold,
    overtimeMultiplier: job?.overtimeMultiplier ?? defaults.overtimeMultiplier,
  };
  const gross = wagesFor(
    {
      id: "calculator",
      date: "2000-01-01",
      startedAt: "2000-01-01T00:00:00Z",
      endedAt: new Date(
        Date.parse("2000-01-01T00:00:00Z") + hours * 3600000,
      ).toISOString(),
      lunchMinutes: 0,
      breakMinutes: 0,
      earnings: 0,
    },
    [],
    plan,
  );
  const applicable = deductions.filter(
    (item) =>
      item.enabled &&
      item.frequency === "daily" &&
      (!item.jobId || item.jobId === job?.id) &&
      (!item.applicableFromDate || item.applicableFromDate <= date) &&
      (!item.applicableToDate || item.applicableToDate >= date) &&
      (item.isPercentage ||
        (item.currency ??
          (item.jobId ? (job?.currency ?? globalCurrency) : globalCurrency)) ===
          currency),
  );
  const total = applicable.reduce(
    (sum, item) =>
      sum + (item.isPercentage ? (gross * item.amount) / 100 : item.amount),
    0,
  );
  return {
    scope: job?.id ?? "global",
    currency,
    hourlyRate: plan.hourlyRate,
    overtimeThreshold: plan.overtimeThreshold,
    overtimeMultiplier: plan.overtimeMultiplier,
    gross,
    deductions: total,
    net: Math.max(0, gross - total),
  };
}
