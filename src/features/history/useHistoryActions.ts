"use client";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { addManualShift, updateHistoryShift, deleteHistoryShift, toggleHistoryPaid, markHistoryPaidMany, reactivateHistoryShift } from "@/store/appSlice";
import { csvFor, localDate, paymentStatus, prepareEntry, selectable, type EntryDraft, type HistoryFilters } from "./model";
import { canResume, visibleHistory } from "./summary";
import type { Shift } from "@/types";
import { newestFirst } from "./viewModel";

export function useHistoryActions() {
  const { commit, read, notify } = useWorkspace(), router = useRouter();
  const save = async (draft: EntryDraft, original?: Shift) => {
    const current = read();
    const preview = prepareEntry(draft, current.jobs, current.defaultPlan, original, current.preferences.currency);
    if (!preview.ok) return preview.error;
    const saved = await commit((latest) => {
      const existing = original ? latest.history.find((entry) => entry.id === original.id) : undefined;
      if (original && (!existing || JSON.stringify(existing) !== JSON.stringify(original))) throw new Error("This entry changed while the form was open. Your inputs are kept; close and reopen it to review the current record.");
      if (existing && paymentStatus(existing, latest.paychecks, latest.jobs) === "Paid via Paycheck" && draft.paid !== Boolean(existing.paid)) throw new Error("Manage this entry's payment status through its paycheck in Pay.");
      const result = prepareEntry(draft, latest.jobs, latest.defaultPlan, existing, latest.preferences.currency);
      if (!result.ok) throw new Error(result.error);
      // Keep the ID chosen for a new record stable across preview and save.
      const entry = { ...result.entry, id: original?.id ?? preview.entry.id };
      return original ? updateHistoryShift({ id: original.id, changes: entry }) : addManualShift(entry);
    });
    if (!saved) return "Entry not saved. Your inputs are still here. Review the message and try again.";
    if (!read().isPremium && draft.date.slice(0, 7) !== localDate().slice(0, 7)) notify("Entry saved. Free shows current-month history; preview Premium to view older entries.");
    else notify(original ? "History entry updated." : "History entry saved.");
    return null;
  };
  const remove = (id: string) => commit((latest) => {
    if (!latest.history.some((entry) => entry.id === id)) throw new Error("This entry was already removed.");
    return deleteHistoryShift(id);
  });
  const paid = (id: string) => commit((latest) => {
    const entry = latest.history.find((item) => item.id === id);
    if (!entry || ["Paid via Paycheck", "Incomplete"].includes(paymentStatus(entry, latest.paychecks, latest.jobs))) throw new Error("This payment status can no longer be changed from History.");
    return toggleHistoryPaid(id);
  });
  const bulkPaid = (ids: string[]) => commit((latest) => {
    const eligible = latest.history.filter((entry) => ids.includes(entry.id) && selectable(entry, latest.paychecks, latest.jobs));
    if (!eligible.length) throw new Error("No selected shifts are still eligible to mark paid.");
    return markHistoryPaidMany(eligible.map((entry) => entry.id));
  });
  const resume = async (id: string) => {
    if (await commit((latest) => {
      const entry = latest.history.find((item) => item.id === id);
      if (!entry || !canResume(entry, latest)) throw new Error("This entry cannot be resumed now. Check the current shift in Tracker.");
      return reactivateHistoryShift(id);
    })) router.push("/tracker");
  };
  const exportCsv = (filters: HistoryFilters) => {
    const latest = read();
    if (!latest.isPremium) { router.push("/plans?returnTo=history"); return; }
    const entries = newestFirst(visibleHistory(latest, filters, true).entries);
    if (!entries.length) { notify("No matching saved entries to export."); return; }
    const blob = new Blob(["\uFEFF", csvFor(entries, latest.jobs, latest.defaultPlan, latest.preferences.currency, latest.paychecks)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `clocked-paid-history-${localDate()}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return { save, remove, paid, bulkPaid, resume, exportCsv };
}
