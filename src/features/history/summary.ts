import type { AppState, Shift } from "../../types";
import { deductionAmount } from "../pay/model";
import {
  localDate,
  entitledEntries,
  filterEntries,
  paymentStatus,
  wagesFor,
  workedMinutes,
  type HistoryFilters,
} from "./model";

export const entryCurrency = (entry: Shift, data: AppState) =>
  entry.currency ??
  data.jobs.find((job) => job.id === entry.jobId)?.currency ??
  data.preferences.currency;

export function visibleHistory(
  data: AppState,
  filters: HistoryFilters,
  premium: boolean,
  now = Date.now(),
) {
  const live = [data.activeShift, ...data.extraShifts].filter(
    (entry): entry is Shift => Boolean(entry),
  );
  const liveIds = new Set(live.map((entry) => entry.id));
  const matching = (entries: Shift[]) =>
    entitledEntries(
      filterEntries(entries, filters, undefined, new Date(now)).filter(
        (entry) =>
          !filters.unpaidOnly ||
          !paymentStatus(entry, data.paychecks, data.jobs).startsWith("Paid"),
      ),
      premium,
      new Date(now),
    );
  return {
    entries: matching(data.history.filter((entry) => !liveIds.has(entry.id))),
    live: matching(live),
  };
}

// Each currency is its own ledger. Fixed deductions use the same dated/prorated
// policy as Pay; percentages apply only to earnings in their job/date scope.
export function historySummary(
  entries: Shift[],
  data: AppState,
  live: Shift[] = [],
  now = Date.now(),
) {
  const combined = [...entries, ...live];
  const liveIds = new Set(live.map((entry) => entry.id));
  return [...new Set(combined.map((entry) => entryCurrency(entry, data)))]
    .sort()
    .map((currency) => {
      const records = combined.filter(
        (entry) => entryCurrency(entry, data) === currency,
      );
      const wages = records.reduce(
        (sum, entry) =>
          sum +
          wagesFor(
            entry,
            data.jobs,
            data.activeShift?.id === entry.id
              ? data.todayPlan
              : data.defaultPlan,
            liveIds.has(entry.id) ? now : undefined,
          ),
        0,
      );
      const tips = records.reduce(
        (sum, entry) =>
          sum + (entry.entryType === "project" ? 0 : (entry.tips ?? 0)),
        0,
      );
      const gross = wages + tips;
      const deductions = data.deductions.reduce((sum, item) => {
        const scoped = records.filter(
          (entry) =>
            (entry.entryType === "project" ||
              (!entry.missingClockIn &&
                (entry.endedAt || liveIds.has(entry.id)))) &&
            (!item.jobId || entry.jobId === item.jobId) &&
            (!item.applicableFromDate ||
              entry.date >= item.applicableFromDate) &&
            (!item.applicableToDate || entry.date <= item.applicableToDate),
        );
        if (!scoped.length) return sum;
        const deductionCurrency =
          item.currency ??
          data.jobs.find((job) => job.id === item.jobId)?.currency ??
          data.preferences.currency;
        if (!item.isPercentage && deductionCurrency !== currency) return sum;
        const dates = scoped.map((entry) => entry.date).sort();
        const scopedGross = scoped.reduce(
          (value, entry) =>
            value +
            wagesFor(
              entry,
              data.jobs,
              data.activeShift?.id === entry.id
                ? data.todayPlan
                : data.defaultPlan,
              liveIds.has(entry.id) ? now : undefined,
            ) +
            (entry.entryType === "project" ? 0 : (entry.tips ?? 0)),
          0,
        );
        return (
          sum +
          deductionAmount(
            item,
            scopedGross,
            new Map([[item.jobId ?? null, scopedGross]]),
            { start: dates[0]!, end: dates[dates.length - 1]! },
          )
        );
      }, 0);
      return {
        currency,
        wages,
        tips,
        gross,
        deductions,
        net: Math.max(0, gross - deductions),
        minutes: records.reduce(
          (sum, entry) =>
            sum + workedMinutes(entry, liveIds.has(entry.id) ? now : undefined),
          0,
        ),
      };
    });
}

export function canResume(entry: Shift, data: AppState, now = Date.now()) {
  return (
    !data.activeShift &&
    !data.orphanedShift &&
    entry.entryType !== "project" &&
    !entry.missingClockIn &&
    !entry.endedAt &&
    !entry.paid &&
    entry.date === localDate(new Date(now)) &&
    Number.isFinite(Date.parse(entry.startedAt)) &&
    Date.parse(entry.startedAt) <= now &&
    (!entry.jobId ||
      data.jobs.some((job) => job.id === entry.jobId && !job.archived)) &&
    !data.extraShifts.some((shift) => shift.jobId === entry.jobId) &&
    (!data.extraShifts.length ||
      (data.isPremium && data.preferences.allowConcurrentShifts))
  );
}
