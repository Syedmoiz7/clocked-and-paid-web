"use client";
import Link from "next/link";
import {
  CalendarRange,
  CalendarCheck,
  Clock,
  TrendingUp,
  Receipt,
  Info,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import { Field } from "@/components/Fields";
import { currencies, localDate } from "@/features/history/model";
import { addDays } from "@/features/history/payPeriods";
import {
  currentPaySchedule,
  entryCurrency,
  moveSchedule,
  payViewSchedule,
  rangeBounds,
  ranges,
  scheduleFor,
  validBounds,
  type Bounds,
  type Range,
} from "../model";
import type { PaySchedule } from "@/types";
import { usePayActions } from "../usePayActions";
import { FinancialSummary } from "./FinancialSummary";
import { ScheduleForm } from "./ScheduleForm";
import { Paychecks } from "./Paychecks";
import { Deductions } from "./Deductions";
import { Estimator } from "./Estimator";
import { Progress, Trends } from "./Trends";
import { PaySection, Paywall } from "./Shared";

export function Pay() {
  const data = useApp(),
    { busy } = useWorkspace(),
    actions = usePayActions(),
    router = useRouter();
  const [scope, setScope] = useState(""),
    [currency, setCurrency] = useState(data.preferences.currency),
    [mode, setMode] = useState("payPeriod"),
    [range, setRange] = useState<Range>("last30");
  const [custom, setCustom] = useState<Bounds>(() => ({
    start: addDays(localDate(), -29),
    end: localDate(),
  }));
  const [offset, setOffset] = useState(0),
    [showCurrent, setShowCurrent] = useState(true),
    [now, setNow] = useState(Date.now());
  const [setup, setSetup] = useState<{
    scope: string;
    initial: PaySchedule;
    original?: PaySchedule;
  } | null>(null);
  const premium = data.isPremium,
    jobId = data.jobs.some((job) => job.id === scope) ? scope : null,
    effectiveMode = premium ? mode : "payPeriod";
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(
      refresh,
      data.activeShift || data.extraShifts.length ? 1000 : 30000,
    );
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [data.activeShift, data.extraShifts.length]);
  useEffect(() => {
    if (!premium) {
      setMode("payPeriod");
      setOffset(0);
      setShowCurrent(true);
    }
  }, [premium]);
  const today = localDate(new Date(now));
  const available = [
    ...new Set([
      data.preferences.currency,
      ...data.jobs.map((job) => job.currency ?? data.preferences.currency),
      ...data.history.map((entry) => entryCurrency(entry, data)),
      ...data.extraShifts.map((entry) => entryCurrency(entry, data)),
      ...(data.activeShift ? [entryCurrency(data.activeShift, data)] : []),
      ...data.paychecks.map(
        (record) =>
          record.currency ??
          data.jobs.find((job) => job.id === record.jobId)?.currency ??
          data.preferences.currency,
      ),
    ]),
  ].filter((value) => currencies.includes(value));
  const code = available.includes(currency)
    ? currency
    : data.preferences.currency;
  let schedule = payViewSchedule(data, jobId, today);
  if (schedule && (showCurrent || !premium))
    schedule = currentPaySchedule(schedule, today);
  if (schedule && premium)
    for (let i = 0; i < Math.abs(offset); i++)
      schedule = moveSchedule(schedule, offset > 0 ? 1 : -1);
  const bounds =
    effectiveMode === "custom"
      ? custom
      : effectiveMode === "preset"
        ? rangeBounds(range, data.history, today)
        : schedule
          ? { start: schedule.periodStart, end: schedule.periodEnd }
          : rangeBounds("thisMonth", data.history, today);
  const valid = validBounds(bounds);
  const selectScope = (value: string) => {
    setScope(value);
    setOffset(0);
    setShowCurrent(true);
    setCurrency(data.jobs.find((job) => job.id === value)?.currency ?? code);
  };
  const changeMode = (value: string) => {
    if (!premium && value !== "payPeriod") router.push("/plans?returnTo=pay");
    else setMode(value);
  };
  return (
    <div className="pay-page">
      <div className="page-heading pay-heading">
        <div>
          <h1>Pay</h1>
          <p>Earnings, pay periods & take-home estimate</p>
        </div>
      </div>
      <section className="card pay-filter-card" aria-label="Pay filters">
        <div className="pay-filter-heading">
          <h2>
            <CalendarRange size={14} aria-hidden="true" />
            {premium ? "Financial Summary" : "Current Period Pay"}
          </h2>
          <div className="chips" aria-label="Pay date mode">
            {[
              ["payPeriod", "Pay period"],
              ["preset", "Presets"],
              ["custom", "Custom"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={effectiveMode === value}
                onClick={() => changeMode(value)}
              >
                {label}
                {!premium && value !== "payPeriod" ? " · Premium" : ""}
              </button>
            ))}
          </div>
        </div>
        <p className="pay-filter-hint">
          One set of dates, job and currency filters for this page
        </p>
        <div className="pay-row">
          <div className="pay-selects">
            <label className="field">
              <span>Pay job</span>
              <select
                value={jobId ?? ""}
                onChange={(event) => selectScope(event.target.value)}
              >
                <option value="">All jobs</option>
                {data.jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.name}
                    {job.archived ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Pay currency</span>
              <select
                value={code}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {available.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {effectiveMode === "preset" && (
          <div className="chips">
            {ranges.map((item) => (
              <button
                key={item.value}
                aria-pressed={range === item.value}
                onClick={() => setRange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        {effectiveMode === "custom" && (
          <div className="field-grid">
            <Field
              label="From"
              type="date"
              value={custom.start}
              onChange={(event) =>
                setCustom({ ...custom, start: event.target.value })
              }
            />
            <Field
              label="To"
              type="date"
              value={custom.end}
              onChange={(event) =>
                setCustom({ ...custom, end: event.target.value })
              }
            />
          </div>
        )}
        {effectiveMode === "payPeriod" && (
          <div className="pay-period-controls">
            {schedule ? (
              <>
                <div className="button-row">
                  <button
                    onClick={() =>
                      premium
                        ? setOffset((value) => value - 1)
                        : changeMode("preset")
                    }
                  >
                    ← Previous period
                  </button>
                  <button
                    disabled={showCurrent && offset === 0}
                    onClick={() => {
                      setOffset(0);
                      setShowCurrent(true);
                    }}
                  >
                    Current period
                  </button>
                  <button
                    onClick={() =>
                      premium
                        ? setOffset((value) => value + 1)
                        : changeMode("preset")
                    }
                  >
                    Next period →
                  </button>
                </div>
                <p>Expected pay date: {schedule.payDate}</p>
              </>
            ) : (
              <p>
                No pay schedule for this scope. Showing this month until you set
                one. All jobs uses its own summary schedule.
              </p>
            )}
            <button
              disabled={busy}
              onClick={() => {
                const scope = jobId ?? "__fs__";
                setSetup({
                  scope,
                  initial: schedule ?? scheduleFor("biweekly", today),
                  original: data.paySchedules[scope],
                });
              }}
            >
              {schedule ? "Edit pay schedule" : "Set up pay schedule"}
            </button>
          </div>
        )}
        <p className="pay-range">
          {bounds.start || "Choose start"} → {bounds.end || "Choose end"} ·{" "}
          {code} only. Currencies are never converted or combined.
        </p>
      </section>
      {valid ? (
        <FinancialSummary
          data={data}
          bounds={bounds}
          jobId={jobId}
          currency={code}
          now={now}
        />
      ) : (
        <p role="alert" className="warning">
          Choose a valid date range to see Pay calculations.
        </p>
      )}
      <PaySection
        title="Upcoming Paychecks"
        icon={<CalendarCheck size={16} />}
        subtitle="Current and previous scheduled periods · received receipts follow the selected dates"
      >
        {premium ? (
          valid ? (
            <Paychecks
              data={data}
              jobId={jobId}
              currency={code}
              bounds={bounds}
              busy={busy}
            />
          ) : (
            <p>Choose valid dates above.</p>
          )
        ) : (
          <Paywall title="Paycheck schedules & receipts" />
        )}
      </PaySection>
      <PaySection
        title="Progress · selected dates"
        icon={<Clock size={16} />}
        kind="progress"
        subtitle="Completed work only · same dates as the summary"
      >
        {valid ? (
          <Progress data={data} jobId={jobId} currency={code} bounds={bounds} />
        ) : (
          <p>Choose valid dates above.</p>
        )}
      </PaySection>
      <PaySection
        title="Trends"
        icon={<TrendingUp size={16} />}
        subtitle="Earnings, hours worked and per-job breakdown · completed work only"
      >
        {premium ? (
          valid ? (
            <Trends data={data} jobId={jobId} currency={code} bounds={bounds} />
          ) : (
            <p>Choose valid dates above.</p>
          )
        ) : (
          <Paywall title="Earnings & hours trends" />
        )}
      </PaySection>
      <PaySection
        title="Estimator & Deductions"
        icon={<Receipt size={16} />}
        subtitle="Understand take-home pay and manage saved deduction rules"
      >
        {premium ? (
          valid ? (
            <>
              <Estimator
                key={`${jobId}-${code}-${bounds.start}-${bounds.end}`}
                data={data}
                jobId={jobId}
                currency={code}
                bounds={bounds}
              />
              <Deductions
                data={data}
                jobId={jobId}
                currency={code}
                bounds={bounds}
                busy={busy}
              />
            </>
          ) : (
            <p>Choose valid dates above.</p>
          )
        ) : (
          <Paywall title="Estimator, taxes & deductions" />
        )}
      </PaySection>
      <p className="pay-disclaimer">
        <Info size={16} aria-hidden="true" />
        <span>
          Estimates only. Recorded amounts, deductions and employer policies can
          change actual take-home pay. This local preview does not process
          payroll.
        </span>
      </p>
      {premium && (
        <Link href="/plans?returnTo=pay">Manage Premium preview →</Link>
      )}
      {setup && (
        <ScheduleForm
          initial={setup.initial}
          jobId={setup.scope === "__fs__" ? null : setup.scope}
          onClose={() => setSetup(null)}
          onSave={async (schedule, apply) => {
            const error = await actions.schedule(
              setup.scope,
              schedule,
              apply,
              setup.original,
            );
            if (!error) {
              setOffset(0);
              setShowCurrent(false);
            }
            return error;
          }}
        />
      )}
    </div>
  );
}
