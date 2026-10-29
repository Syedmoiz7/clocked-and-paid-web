"use client";
import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  Quote,
  History,
  Pencil,
  SlidersHorizontal,
  Bell,
  CalendarClock,
  Clock,
} from "lucide-react";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import { Modal, Panel, Field } from "@/components/Fields";
import { clockIn, clockOut, clockOutExtraShift } from "@/store/appSlice";
import {
  formatDuration,
  trackerMetrics,
  finishShift,
  completedShiftTotals,
} from "../model";
import {
  trackerSections,
  visibleTrackerSection,
  type TrackerSectionId,
} from "../sections";
import { getDailyQuote } from "../quotes";
import { localDate, money, workedMinutes } from "@/features/history/model";
import type { Shift } from "@/types";
import { ManualTimesForm, newShift } from "./ManualTimesForm";
import { Calculator } from "./Calculator";
import { TodayPlan } from "./TodayPlan";
import { Reminders } from "./Reminders";
import { ShiftClock, ShiftProgress, AdditionalShifts } from "./ShiftCards";
import { TodaySummary } from "./TodaySummary";
import { Recovery } from "./Recovery";

export function Tracker() {
  const data = useApp(),
    { read, commit, busy, notify } = useWorkspace();
  const [now, setNow] = useState(() => Date.now()),
    [quoteOffset, setQuoteOffset] = useState(0);
  const [selected, setSelected] = useState<TrackerSectionId>(() =>
    data.activeShift ? "plan" : "manual",
  );
  const [editing, setEditing] = useState<string | null>(null),
    [tipShift, setTipShift] = useState<string | null>(null);
  const [tips, setTips] = useState(""),
    [tipType, setTipType] = useState<NonNullable<Shift["tipType"]>>("cash");
  const shift = data.activeShift,
    job = data.jobs.find(
      (item) => item.id === (shift?.jobId ?? data.selectedJobId),
    );
  const metrics = trackerMetrics(shift, data.todayPlan, now);
  const day = localDate(new Date(now)),
    completed = data.history.filter(
      (entry) =>
        entry.date === day && Boolean(entry.endedAt) && !entry.missingClockIn,
    );
  const section = visibleTrackerSection(
    selected,
    data.preferences.enableManualEditing,
  );
  const tabs = trackerSections(
    data.preferences.enableManualEditing,
    completed.length,
  );
  const quote = getDailyQuote("local-workspace", day, quoteOffset);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  const fmt = (
    amount: number,
    currency = job?.currency ?? data.preferences.currency,
  ) => (data.payVisible ? money(amount, currency) : "•••••");
  const time = (value: string | number) =>
    new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: data.preferences.clockFormat === "12h",
    });
  const begin = async () => {
    const current = read(),
      selectedJob = current.jobs.find(
        (item) => item.id === current.selectedJobId && !item.archived,
      );
    if (!selectedJob || current.orphanedShift || current.activeShift) {
      notify(
        "Resolve the unfinished shift and choose an available job before clocking in.",
      );
      return;
    }
    await commit(
      clockIn(
        newShift(
          selectedJob.id,
          selectedJob.currency ?? current.preferences.currency,
        ),
      ),
    );
  };
  const finish = async (
    id: string,
    value = 0,
    type: Shift["tipType"] = null,
  ) => {
    const current = read(),
      source =
        current.activeShift?.id === id
          ? current.activeShift
          : current.extraShifts.find((item) => item.id === id);
    if (!source) {
      notify("This shift is no longer running.");
      return;
    }
    const ended = {
      ...finishShift(
        source,
        new Date().toISOString(),
        current,
        current.activeShift?.id === id,
      ),
      tips: value,
      tipType: value ? type : null,
    };
    if (
      await commit(
        current.activeShift?.id === id
          ? clockOut(ended)
          : clockOutExtraShift(ended),
      )
    ) {
      setTipShift(null);
      setTips("");
    }
  };
  const requestFinish = (id: string) => {
    const current = read(),
      source =
        current.activeShift?.id === id
          ? current.activeShift
          : current.extraShifts.find((item) => item.id === id);
    if (!source) return;
    if (current.jobs.find((item) => item.id === source.jobId)?.enableTips) {
      setTipShift(id);
      setTips("");
      setTipType("cash");
    } else void finish(id);
  };
  const status = !shift
    ? "Off Duty"
    : shift.lunchStartedAt
      ? "On lunch"
      : shift.breakStartedAt
        ? "On break"
        : "Working";
  const editShift = data.history.find((entry) => entry.id === editing);
  return (
    <div className="tracker-page">
      <header className="tracker-heading">
        <div className="page-heading">
          <div>
            <h1>Today&apos;s Shift</h1>
            <p>
              {new Date(now).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <span
            className={`badge ${shift ? (shift.lunchStartedAt ? "on-lunch" : shift.breakStartedAt ? "on-break" : "working") : ""}`}
          >
            ● {status}
          </span>
        </div>
        {data.preferences.showDailyQuote && (
          <aside className="quote">
            <Quote size={16} aria-hidden="true" />
            <div>
              <p>{quote.text}</p>
              <small>— {quote.author}</small>
            </div>
            <div className="quote-navigation">
              <button
                aria-label="Previous quote"
                onClick={() => setQuoteOffset((value) => value - 1)}
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <button
                aria-label="Next quote"
                onClick={() => setQuoteOffset((value) => value + 1)}
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </aside>
        )}
      </header>
      {data.orphanedShift && <Recovery />}
      <ShiftClock now={now} begin={begin} requestFinish={requestFinish} />
      <ShiftProgress now={now} />
      <AdditionalShifts now={now} requestFinish={requestFinish} />
      <TodaySummary now={now} />
      <div className="tabs" role="tablist" aria-label="Tracker sections">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={section === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={section === tab.id ? 0 : -1}
            onClick={() => setSelected(tab.id)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setSelected(tabs[next].id);
              document.getElementById(`tab-${tabs[next].id}`)?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        id="panel-completed"
        role="tabpanel"
        aria-labelledby="tab-completed"
        hidden={section !== "completed"}
      >
        <Panel
          title={`Completed Today (${completed.length})`}
          icon={<Clock size={16} />}
          subtitle="Saved shifts and time corrections"
        >
          {!completed.length ? (
            <div className="empty">
              <History size={28} />
              <h3>No completed shifts today</h3>
              <p>Clock out or save a completed manual entry to see it here.</p>
            </div>
          ) : (
            completed.map((entry) => (
              <div className="shift-row completed-shift-row" key={entry.id}>
                <div className="completed-shift-details">
                  <h3>
                    {data.jobs.find((item) => item.id === entry.jobId)?.name ??
                      "Unassigned job"}
                  </h3>
                  <p>
                    {time(entry.startedAt)}–{time(entry.endedAt!)} ·{" "}
                    {formatDuration(workedMinutes(entry) * 60)}
                  </p>
                  <small>
                    {formatDuration(entry.lunchMinutes * 60)} lunch ·{" "}
                    {formatDuration(entry.breakMinutes * 60)} breaks
                  </small>
                </div>
                <strong className="completed-shift-pay mono">
                  {fmt(
                    completedShiftTotals(
                      entry,
                      data.jobs,
                      data.defaultPlan,
                      data.preferences.currency,
                    ).total,
                    entry.currency ?? data.preferences.currency,
                  )}
                </strong>
                {data.preferences.enableManualEditing && (
                  <button disabled={busy} onClick={() => setEditing(entry.id)}>
                    <Pencil size={14} /> Edit times
                  </button>
                )}
              </div>
            ))
          )}
        </Panel>
      </div>
      {data.preferences.enableManualEditing && (
        <div
          id="panel-manual"
          role="tabpanel"
          aria-labelledby="tab-manual"
          hidden={section !== "manual"}
        >
          <Panel
            title={shift ? "Manual Adjustments" : "Enter Today's Times"}
            icon={<Pencil size={16} />}
            subtitle="Clock-in, lunch and clock-out corrections"
          >
            <ManualTimesForm key={shift?.id ?? "new"} shift={shift} />
          </Panel>
        </div>
      )}
      <div
        id="panel-plan"
        role="tabpanel"
        aria-labelledby="tab-plan"
        hidden={section !== "plan"}
      >
        <Panel
          title="Today's Plan"
          icon={<SlidersHorizontal size={16} />}
          subtitle={`${data.todayPlan.plannedHours.toFixed(2).replace(/\.00$/, "")}h work · ${data.todayPlan.lunchEnabled ? `${data.todayPlan.lunchMinutes}m lunch` : "no lunch"}`}
        >
          <TodayPlan />
        </Panel>
      </div>
      <div
        id="panel-reminders"
        role="tabpanel"
        aria-labelledby="tab-reminders"
        hidden={section !== "reminders"}
      >
        <Panel
          title="Reminders"
          icon={<Bell size={16} />}
          subtitle="Lunch and return-to-work alerts"
        >
          <Reminders />
        </Panel>
      </div>
      <div
        id="panel-calculator"
        role="tabpanel"
        aria-labelledby="tab-calculator"
        hidden={section !== "calculator"}
      >
        <Panel
          title="Hours Calculator"
          icon={<CalendarClock size={16} />}
          subtitle="Calculate pay from manual times or paid hours"
        >
          <Calculator />
        </Panel>
      </div>
      {editShift && (
        <Modal
          title="Edit completed times"
          busy={busy}
          onClose={() => setEditing(null)}
        >
          <ManualTimesForm
            key={editShift.id}
            shift={editShift}
            editing
            onSaved={() => setEditing(null)}
          />
        </Modal>
      )}
      {tipShift && (
        <Modal
          title="Add tips to this shift"
          busy={busy}
          onClose={() => setTipShift(null)}
        >
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const value = Number(tips || 0);
              if (!Number.isFinite(value) || value < 0) return;
              void finish(tipShift, value, tipType);
            }}
          >
            <Field
              label="Tips amount (optional)"
              type="number"
              min="0"
              step="0.01"
              value={tips}
              onChange={(e) => setTips(e.target.value)}
            />
            <label className="field">
              <span>Tip type</span>
              <select
                value={tipType}
                onChange={(e) => setTipType(e.target.value as typeof tipType)}
              >
                {["cash", "paycheck", "card", "other"].map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <button className="primary" disabled={busy}>
              Save tips & clock out
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
