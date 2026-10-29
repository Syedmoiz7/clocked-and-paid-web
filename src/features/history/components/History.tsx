"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Download,
  List,
  Plus,
  SearchX,
  Sparkles,
  CheckCheck,
} from "lucide-react";
import { Modal } from "@/components/Fields";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import {
  blankDraft,
  defaultFilters,
  draftForEntry,
  localDate,
  selectable,
  type EntryDraft,
  type HistoryFilters as Filters,
} from "../model";
import { visibleHistory } from "../summary";
import { newestFirst } from "../viewModel";
import { useHistoryActions } from "../useHistoryActions";
import { HistoryFilters } from "./HistoryFilters";
import { HistoryTotals } from "./HistoryTotals";
import { HistoryEntry } from "./HistoryEntry";
import { EntryForm } from "./EntryForm";
import { CalendarView } from "./CalendarView";
import type { Shift } from "@/types";

type FormState = { initial: EntryDraft; original?: Shift };
type Confirmation =
  { kind: "delete"; id: string } | { kind: "bulk"; ids: string[] };
export function History() {
  const data = useApp(),
    { busy } = useWorkspace(),
    actions = useHistoryActions();
  const [view, setView] = useState<"list" | "calendar">("list"),
    [filters, setFilters] = useState(defaultFilters);
  const [form, setForm] = useState<FormState | null>(null),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [selectionMode, setSelectionMode] = useState(false),
    [selected, setSelected] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now()),
      timer = setInterval(
        tick,
        data.activeShift || data.extraShifts.length ? 1000 : 30000,
      );
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [data.activeShift?.id, data.extraShifts.length]);
  const visible = visibleHistory(data, filters, data.isPremium, now),
    entries = newestFirst(visible.entries);
  const eligible = entries
    .filter((entry) => selectable(entry, data.paychecks, data.jobs))
    .map((entry) => entry.id);
  const selectedEligible = selected.filter((id) => eligible.includes(id));
  const updateFilters = (changes: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...changes }));
    setSelected([]);
  };
  const clearFilters = () => {
    setFilters(defaultFilters());
    setSelected([]);
  };
  const add = (type: EntryDraft["entryType"]) =>
    setForm({
      initial: { ...blankDraft(type), currency: data.preferences.currency },
    });
  const edit = (entry: Shift) =>
    setForm({ initial: draftForEntry(entry), original: entry });
  const confirm = async () => {
    if (!confirmation || busy) return;
    const saved =
      confirmation.kind === "delete"
        ? await actions.remove(confirmation.id)
        : await actions.bulkPaid(confirmation.ids);
    if (saved) {
      setConfirmation(null);
      setSelected([]);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Work History</h1>
          <p>Your time, earnings, and workdays in one place.</p>
        </div>
        <div className="actions">
          <button disabled={busy} onClick={() => add("shift")}>
            <Plus size={16} /> Add shift
          </button>
          <button disabled={busy} onClick={() => add("project")}>
            <Plus size={16} /> Add project
          </button>
        </div>
      </div>
      <div className="history-view-toggle" aria-label="History display">
        <button aria-pressed={view === "list"} onClick={() => setView("list")}>
          <List size={17} /> List
        </button>
        <button
          aria-pressed={view === "calendar"}
          onClick={() => setView("calendar")}
        >
          <CalendarDays size={17} /> Calendar
          {!data.isPremium && <Sparkles size={13} />}
        </button>
      </div>
      <div hidden={view !== "list"}>
        <HistoryFilters
          filters={filters}
          onChange={updateFilters}
          onClear={clearFilters}
          now={now}
        />
        <HistoryTotals
          entries={entries}
          live={visible.live}
          filters={filters}
          now={now}
        />
        <div className="history-list-toolbar">
          <p>
            {entries.length} saved {entries.length === 1 ? "entry" : "entries"}
            {visible.live.length ? ` + ${visible.live.length} running` : ""}
          </p>
          <button
            disabled={busy}
            aria-pressed={selectionMode}
            onClick={() => {
              setSelectionMode(!selectionMode);
              setSelected([]);
            }}
          >
            {selectionMode ? "Done selecting" : "Select shifts"}
          </button>
        </div>
        {selectionMode && (
          <section className="bulk-toolbar" aria-label="Bulk payment actions">
            <span>{selectedEligible.length} selected</span>
            <button
              disabled={busy || !eligible.length}
              onClick={() => setSelected(eligible)}
            >
              Select all eligible ({eligible.length})
            </button>
            <button
              disabled={busy || !selected.length}
              onClick={() => setSelected([])}
            >
              Clear selection
            </button>
            <button
              className="primary"
              disabled={busy || !selectedEligible.length}
              onClick={() =>
                setConfirmation({ kind: "bulk", ids: selectedEligible })
              }
            >
              <CheckCheck size={16} /> Mark selected paid
            </button>
            <small>
              Only complete, unpaid shifts without a paid paycheck receipt can
              be selected. Projects are managed individually.
            </small>
          </section>
        )}
        <div className="history-entries">
          {visible.live.map((entry) => (
            <HistoryEntry key={entry.id} entry={entry} live now={now} />
          ))}
          {entries.map((entry) => (
            <HistoryEntry
              key={entry.id}
              entry={entry}
              now={now}
              selectionMode={selectionMode}
              selected={selectedEligible.includes(entry.id)}
              onSelect={() =>
                setSelected((current) =>
                  current.includes(entry.id)
                    ? current.filter((id) => id !== entry.id)
                    : [...current, entry.id],
                )
              }
              onEdit={() => edit(entry)}
              onPaid={() => void actions.paid(entry.id, Boolean(entry.paid))}
              onDelete={() => setConfirmation({ kind: "delete", id: entry.id })}
              onResume={() => void actions.resume(entry.id)}
            />
          ))}
        </div>
        {!entries.length && !visible.live.length && (
          <section className="card empty">
            <SearchX size={30} />
            <h2>
              {data.history.length ||
              filters.period !== "all" ||
              filters.jobId ||
              filters.type !== "all" ||
              filters.unpaidOnly
                ? "No matching entries"
                : "No history yet"}
            </h2>
            <p>
              No shifts or projects recorded during this period match your
              filters.
            </p>
            <div className="actions empty-actions">
              <button onClick={clearFilters}>Clear all filters</button>
              <button onClick={() => add("shift")}>Add a past shift</button>
            </div>
          </section>
        )}
        <section className="history-export">
          <div>
            <h3>Keep a copy of your work</h3>
            <p>
              CSV includes matching saved entries and pay values, even when pay
              is hidden. Running shifts are excluded.
            </p>
          </div>
          {data.isPremium ? (
            <button
              disabled={busy || !entries.length}
              onClick={() => actions.exportCsv(filters)}
            >
              <Download size={16} /> Export filtered history (CSV)
            </button>
          ) : (
            <Link className="button-link" href="/plans?returnTo=history">
              <Sparkles size={15} /> Export CSV · Premium
            </Link>
          )}
        </section>
        {!data.isPremium && <HistoryPaywall />}
      </div>
      <div hidden={view !== "calendar"}>
        {data.isPremium ? (
          <CalendarView onEdit={edit} now={now} />
        ) : (
          <HistoryPaywall />
        )}
      </div>
      {form && (
        <EntryForm
          key={form.original?.id ?? form.initial.entryType}
          initial={form.initial}
          original={form.original}
          onSave={actions.save}
          onClose={() => setForm(null)}
        />
      )}
      {confirmation && (
        <Modal
          title={
            confirmation.kind === "delete"
              ? "Delete entry?"
              : "Mark selected shifts as paid?"
          }
          busy={busy}
          onClose={() => setConfirmation(null)}
        >
          <p>
            {confirmation.kind === "delete"
              ? "This removes the entry from History and recalculates Tracker and Pay estimates. Saved paycheck receipts remain unchanged."
              : `${confirmation.ids.length} selected shift(s) will be marked paid. Entries that are no longer eligible will be skipped.`}
          </p>
          <div className="actions">
            <button disabled={busy} onClick={() => setConfirmation(null)}>
              Cancel
            </button>
            <button
              disabled={busy}
              className={confirmation.kind === "delete" ? "danger" : "primary"}
              onClick={() => void confirm()}
            >
              {busy
                ? "Saving…"
                : confirmation.kind === "delete"
                  ? "Delete entry"
                  : "Confirm mark paid"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function HistoryPaywall() {
  return (
    <section className="card paywall history-paywall">
      <Sparkles size={25} />
      <h3>Full History & Calendar</h3>
      <p>
        Free includes the current month&apos;s list. Preview Premium for older
        entries, all calendar views, summaries, and export.
      </p>
      <Link className="button-link primary" href="/plans?returnTo=history">
        See History plans
      </Link>
    </section>
  );
}
