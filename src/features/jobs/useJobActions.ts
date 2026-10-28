"use client";
import { useWorkspace } from "@/components/WorkspaceProvider";
import {
  upsertJob,
  selectJob,
  setDefaultJob,
  removeJob,
  upsertDeduction,
  removeDeduction,
} from "@/store/appSlice";
import {
  validateJob,
  jobEditError,
  jobDeductionError,
  jobInProgress,
  workInProgress,
} from "./model";
import { entitlementsFor } from "@/services/entitlements";
import type { MockJob, Deduction } from "@/types";
import type { WorkspaceCommand } from "@/lib/workspace";

export function useJobActions() {
  const { commit, notify } = useWorkspace();
  const save = async (command: WorkspaceCommand, message?: string) => {
    let validation: string | null = null;
    const changed = await commit((latest) => {
      try {
        return typeof command === "function" ? command(latest) : command;
      } catch (error) {
        validation =
          error instanceof Error ? error.message : "Review the latest profile.";
        throw error;
      }
    });
    if (changed && message) notify(message);
    return changed
      ? null
      : (validation ??
          "Changes were not saved. Your draft is kept; try again.");
  };
  const unchanged = (current: unknown, original: unknown) => {
    if (JSON.stringify(current) !== JSON.stringify(original))
      throw new Error(
        "This record changed in another tab. Close and reopen the editor to review the latest values.",
      );
  };
  return {
    save: (job: MockJob, original?: MockJob) =>
      save((latest) => {
        unchanged(
          latest.jobs.find((item) => item.id === job.id),
          original,
        );
        const error = validateJob(job) ?? jobEditError(latest, job);
        if (error) throw new Error(error);
        return upsertJob(job);
      }, "Job saved. Existing work keeps its recorded pay rules."),
    select: (id: string, makeDefault = false) =>
      save(
        (latest) => {
          if (!latest.jobs.some((job) => job.id === id && !job.archived))
            throw new Error("This job is no longer available.");
          if (workInProgress(latest))
            throw new Error(
              "Finish or resolve running/recoverable shifts before switching profiles.",
            );
          return makeDefault ? setDefaultJob(id) : selectJob(id);
        },
        makeDefault
          ? "Default and Tracker profile updated."
          : "Tracker profile selected; its defaults are loaded.",
      ),
    remove: (original: MockJob) =>
      save((latest) => {
        unchanged(
          latest.jobs.find((job) => job.id === original.id),
          original,
        );
        if (jobInProgress(latest, original.id))
          throw new Error(
            "Finish or recover this job’s shift before removing it.",
          );
        return removeJob(original.id);
      }, "Job removed from active profiles. Existing work and payments are retained."),
    deduction: (value: Deduction, jobId: string, original?: Deduction) =>
      save((latest) => {
        unchanged(
          latest.deductions.find((item) => item.id === value.id),
          original,
        );
        const error = jobDeductionError(latest, value, jobId);
        if (error) throw new Error(error);
        return upsertDeduction(value);
      }),
    removeDeduction: (original: Deduction, jobId: string) =>
      save((latest) => {
        if (!entitlementsFor(latest).deductionsManager)
          throw new Error("Preview Premium to manage deductions.");
        if (!latest.jobs.some((job) => job.id === jobId && !job.archived))
          throw new Error("This job is no longer available.");
        unchanged(
          latest.deductions.find(
            (item) => item.id === original.id && item.jobId === jobId,
          ),
          original,
        );
        return removeDeduction(original.id);
      }),
  };
}
