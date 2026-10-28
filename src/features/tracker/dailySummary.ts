import type { AppState, Shift } from "../../types";
import { localDate, wagesFor, workedMinutes } from "../history/model";
import { historicalRate } from "../pay/model";
import { withPlanRates } from "./model";

export type DailySummarySource = Pick<
  AppState,
  | "history"
  | "activeShift"
  | "extraShifts"
  | "jobs"
  | "defaultPlan"
  | "todayPlan"
  | "preferences"
  | "paychecks"
>;
export type DailyCurrencyTotal = {
  currency: string;
  gross: number;
  net: number;
  tips: number;
  workedSeconds: number;
  lunchSeconds: number;
  breakSeconds: number;
  regularSeconds: number;
  overtimeSeconds: number;
  completedCount: number;
  runningCount: number;
  projectCount: number;
};

// Entries use their recorded local shift date, as in History/Pay. Overnight
// entries stay assigned to their start date; concurrent work sums recorded hours.
export function dailySummary(data: DailySummarySource, now = Date.now()) {
  const day = localDate(new Date(now));
  const entries = new Map<string, { entry: Shift; live: boolean }>();
  for (const entry of data.history) {
    if (
      entry.date !== day ||
      (entry.entryType !== "project" &&
        (!entry.endedAt || entry.missingClockIn || !entry.startedAt))
    )
      continue;
    entries.set(entry.id, { entry, live: false });
  }
  for (const entry of [data.activeShift, ...data.extraShifts]) {
    if (
      !entry ||
      entry.date !== day ||
      entry.endedAt ||
      entry.missingClockIn ||
      !entry.startedAt
    )
      continue;
    entries.set(entry.id, {
      entry:
        entry.id === data.activeShift?.id
          ? withPlanRates(entry, data.todayPlan)
          : entry,
      live: true,
    });
  }
  const groups = new Map<string, DailyCurrencyTotal>();
  for (const { entry, live } of entries.values()) {
    const job = data.jobs.find((job) => job.id === entry.jobId);
    const currency =
      entry.currency ?? job?.currency ?? data.preferences.currency;
    const project = entry.entryType === "project";
    const wages = wagesFor(
      entry,
      data.jobs,
      data.defaultPlan,
      live ? now : undefined,
    );
    const workedSeconds = project
      ? 0
      : workedMinutes(entry, live ? now : undefined) * 60;
    if (!Number.isFinite(wages) || !Number.isFinite(workedSeconds)) continue;
    const tips = project ? 0 : (entry.tips ?? 0);
    const paycheckTips = entry.tipType === "paycheck" ? tips : 0;
    const otherTips = tips - paycheckTips;
    const rate =
      historicalRate(data.paychecks, entry.jobId ?? null, currency)?.rate ?? 0;
    const total = groups.get(currency) ?? {
      currency,
      gross: 0,
      net: 0,
      tips: 0,
      workedSeconds: 0,
      lunchSeconds: 0,
      breakSeconds: 0,
      regularSeconds: 0,
      overtimeSeconds: 0,
      completedCount: 0,
      runningCount: 0,
      projectCount: 0,
    };
    const threshold =
      (entry.overtimeThreshold ??
        job?.overtimeThreshold ??
        data.defaultPlan.overtimeThreshold) * 3600;
    const elapsedPause = (start?: string | null) =>
      live && start ? Math.max(0, (now - Date.parse(start)) / 1000) : 0;
    total.gross += wages + tips;
    total.net += Math.max(0, (wages + paycheckTips) * (1 - rate)) + otherTips;
    total.tips += tips;
    total.workedSeconds += workedSeconds;
    total.regularSeconds += Math.min(workedSeconds, threshold);
    total.overtimeSeconds += Math.max(0, workedSeconds - threshold);
    if (!project) {
      total.lunchSeconds +=
        entry.lunchMinutes * 60 + elapsedPause(entry.lunchStartedAt);
      total.breakSeconds +=
        entry.breakMinutes * 60 + elapsedPause(entry.breakStartedAt);
    }
    if (project) total.projectCount++;
    else if (live) total.runningCount++;
    else total.completedCount++;
    groups.set(currency, total);
  }
  return {
    day,
    groups: [...groups.values()].sort((a, b) =>
      a.currency.localeCompare(b.currency),
    ),
  };
}
