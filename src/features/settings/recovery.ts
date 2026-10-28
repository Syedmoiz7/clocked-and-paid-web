import type { AppState } from "../../types";
import type { ImportData } from "./backup";
import { preserveWorkspacePricing } from "./drafts";

export function recoveryImport(
  data: AppState,
  imported: ImportData,
): ImportData {
  const protectedIds = new Set([
    ...data.history.map((item) => item.id),
    data.activeShift?.id,
    data.orphanedShift?.id,
    ...data.extraShifts.map((item) => item.id),
  ]);
  const snapshot = preserveWorkspacePricing({
    ...data,
    history: imported.history,
    jobs: imported.jobs ?? data.jobs,
    defaultPlan: imported.settings?.plan ?? data.defaultPlan,
    preferences: imported.settings?.preferences ?? data.preferences,
    activeShift: null,
    extraShifts: [],
    orphanedShift: null,
  });
  const history = snapshot.history
    .filter((entry) => !protectedIds.has(entry.id))
    .map((entry) => ({
      ...entry,
      paidByPaycheckId: data.paychecks.some(
        (record) => record.id === entry.paidByPaycheckId,
      )
        ? entry.paidByPaycheckId
        : null,
    }));
  const needed = new Set(history.map((entry) => entry.jobId));
  const jobs = snapshot.jobs
    .filter(
      (job) =>
        needed.has(job.id) &&
        !data.jobs.some((existing) => existing.id === job.id),
    )
    .map((job) => ({ ...job, archived: true, isDefault: false }));
  return {
    format: imported.format,
    history,
    ...(jobs.length ? { jobs } : {}),
    warnings: [
      "Recovery adds missing history and only the removed profile references it needs. Current receipts, deductions, preferences and timers are kept.",
    ],
  };
}
