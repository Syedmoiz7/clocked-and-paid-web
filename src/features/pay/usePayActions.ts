"use client";
import { useWorkspace } from "@/components/WorkspaceProvider";
import {
  savePaySchedule,
  upsertDeduction,
  upsertDeductionsMany,
  removeDeduction,
  recordPaycheck,
  deletePaycheck,
  markHistoryPaidMany,
} from "@/store/appSlice";
import {
  consumptionIds,
  receiptError,
  validateDeduction,
  validateSchedule,
  paycheckDraft,
} from "./model";
import { selectable } from "../history/model";
import type { Deduction, MockPaycheck, PaySchedule, AppState } from "@/types";
import type { WorkspaceCommand } from "@/lib/workspace";

export function usePayActions() {
  const { commit, notify } = useWorkspace();
  const save = async (command: WorkspaceCommand, premium = true) => {
    let validationError: string | null = null;
    const ok = await commit((latest) => {
      try {
        if (premium && !latest.isPremium)
          throw new Error("Preview Premium to use this Pay action.");
        return typeof command === "function" ? command(latest) : command;
      } catch (error) {
        validationError =
          error instanceof Error
            ? error.message
            : "Review the current data and try again.";
        throw error;
      }
    });
    return ok
      ? null
      : (validationError ??
          "Changes were not saved. Your inputs are kept; try again.");
  };
  const unchanged = (current: unknown, original: unknown) => {
    if (JSON.stringify(current) !== JSON.stringify(original))
      throw new Error(
        "This record changed in another tab. Close and reopen the form to review the latest values.",
      );
  };
  return {
    schedule: (
      scope: string,
      schedule: PaySchedule,
      applyToJob: boolean,
      original?: PaySchedule,
    ) =>
      save((latest) => {
        unchanged(latest.paySchedules[scope], original);
        const error = validateSchedule(schedule);
        if (error) throw new Error(error);
        if (scope !== "__fs__" && !latest.jobs.some((job) => job.id === scope))
          throw new Error("This job no longer exists.");
        return savePaySchedule({ scope, schedule, applyToJob });
      }, false),
    deduction: (value: Deduction, original?: Deduction) =>
      save((latest) => {
        unchanged(
          latest.deductions.find((item) => item.id === value.id),
          original,
        );
        const error = validateDeduction(value);
        if (error) throw new Error(error);
        if (value.jobId && !latest.jobs.some((job) => job.id === value.jobId))
          throw new Error("This job no longer exists.");
        return upsertDeduction(value);
      }),
    examples: () =>
      save((latest) => {
        if (latest.deductions.some((item) => !item.jobId))
          throw new Error(
            "Global deductions already exist. Review them before adding examples.",
          );
        return upsertDeductionsMany(
          [
            ["Federal Tax", 200],
            ["State Tax", 75],
            ["Social Security", 85],
            ["Medicare", 20],
          ].map(([label, amount]) => ({
            id: crypto.randomUUID(),
            label: String(label),
            amount: Number(amount),
            currency: latest.preferences.currency,
            frequency: "per-pay-period",
            enabled: true,
            jobId: null,
            notes: "Example amount — replace with your actual withholding.",
          })),
        );
      }),
    removeDeduction: (original: Deduction) =>
      save((latest) => {
        unchanged(
          latest.deductions.find((item) => item.id === original.id),
          original,
        );
        return removeDeduction(original.id);
      }),
    receipt: (record: MockPaycheck) =>
      save((latest: AppState) => {
        const error = receiptError(latest, record);
        if (error) throw new Error(error);
        if (!latest.jobs.some((job) => job.id === record.jobId))
          throw new Error("This job no longer exists.");
        const estimate = paycheckDraft(
          latest,
          record.jobId,
          { start: record.startDate, end: record.endDate },
          record.currency,
        );
        return recordPaycheck({
          paycheck: {
            ...record,
            hoursWorked: estimate.hours,
            shiftCount: estimate.entries.length,
          },
          markShifts: true,
          consumeDeductionIds: consumptionIds(latest, record),
        });
      }),
    undo: (record: MockPaycheck) =>
      save((latest) => {
        unchanged(
          latest.paychecks.find((item) => item.id === record.id),
          record,
        );
        return deletePaycheck(record.id);
      }),
    markPaid: (ids: string[]) =>
      save((latest) => {
        const eligible = latest.history.filter(
          (entry) =>
            ids.includes(entry.id) &&
            selectable(entry, latest.paychecks, latest.jobs),
        );
        if (!eligible.length)
          throw new Error("No shifts remain eligible to mark paid.");
        return markHistoryPaidMany(eligible.map((entry) => entry.id));
      }),
    notify,
  };
}
