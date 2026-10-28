import type { AppState } from "../../types";
import type { ImportData } from "./backup";
export function importImpact(
  data: AppState,
  imported: ImportData,
  mode: "merge" | "replace",
) {
  const protectedIds = new Set([
    data.activeShift?.id,
    data.orphanedShift?.id,
    ...data.extraShifts.map((item) => item.id),
  ]);
  const collections = [
    {
      label: "History",
      current: data.history,
      incoming: imported.history.filter((item) => !protectedIds.has(item.id)),
    },
    { label: "Jobs", current: data.jobs, incoming: imported.jobs },
    {
      label: "Deductions",
      current: data.deductions,
      incoming: imported.deductions,
    },
    {
      label: "Receipts",
      current: data.paychecks,
      incoming: imported.paychecks,
    },
  ];
  return collections.map(({ label, current, incoming }) => {
    const currentIds = new Set(current.map((item) => item.id));
    const incomingIds = new Set(incoming?.map((item) => item.id));
    return {
      label,
      included: incoming !== undefined,
      incoming: incoming?.length ?? 0,
      added: incoming?.filter((item) => !currentIds.has(item.id)).length ?? 0,
      kept:
        mode === "merge"
          ? current.length
          : incoming === undefined
            ? current.length
            : 0,
      removed:
        mode === "replace" && incoming !== undefined
          ? current.filter((item) => !incomingIds.has(item.id)).length
          : 0,
      conflicts:
        incoming?.filter((item) => currentIds.has(item.id)).length ?? 0,
    };
  });
}
