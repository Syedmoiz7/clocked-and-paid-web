"use client";
import { useState } from "react";
import { LogIn, Square, Utensils, TrendingUp, Play, Pause } from "lucide-react";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import { Field, Toggle } from "@/components/Fields";
import {
  startExtraShift,
  startLunch,
  endLunch,
  startBreak,
  endBreak,
  updateTodayPlan,
  updateBreakPreference,
  selectJob,
} from "@/store/appSlice";
import { formatDuration, trackerMetrics, withPlanRates } from "../model";
import { jobPlan } from "@/features/jobs/model";
import { money, workedMinutes, wagesFor } from "@/features/history/model";
import { newShift } from "./ManualTimesForm";
import { localDate } from "@/utils/dateOnly";
function useDisplay(now: number) {
  const data = useApp(),
    { busy, commit } = useWorkspace(),
    shift = data.activeShift;
  const job = data.jobs.find(
    (item) => item.id === (shift?.jobId ?? data.selectedJobId),
  );
  const metrics = trackerMetrics(shift, data.todayPlan, now);
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
  return { data, busy, commit, shift, job, metrics, fmt, time };
}
export function ShiftClock({
  now,
  begin,
  requestFinish,
}: {
  now: number;
  begin: () => Promise<void>;
  requestFinish: (id: string) => void;
}) {
  const { data, busy, commit, shift, job, metrics, fmt, time } =
    useDisplay(now);
  const [breakLabel, setBreakLabel] = useState("");
  const countdown = data.todayPlan.timerDirection === "count-down";
  const seconds = shift?.breakStartedAt
    ? metrics.liveBreak
    : shift?.lunchStartedAt
      ? countdown
        ? Math.max(0, data.todayPlan.lunchMinutes * 60 - metrics.liveLunch)
        : metrics.liveLunch
      : shift
        ? countdown
          ? Math.abs((metrics.projected ?? now) - now) / 1000
          : metrics.worked
        : 0;
  const paused = shift?.lunchStartedAt
    ? "lunch"
    : shift?.breakStartedAt
      ? "break"
      : null;
  const changeLunch = () =>
    void commit(
      shift?.lunchStartedAt
        ? endLunch(new Date().toISOString())
        : startLunch(new Date().toISOString()),
    );
  const changeBreak = () =>
    void commit(
      shift?.breakStartedAt
        ? endBreak(new Date().toISOString())
        : startBreak({
            at: new Date().toISOString(),
            label: breakLabel.trim() || "General break",
          }),
    );
  const primaryLabel = !shift
    ? "Clock in"
    : paused === "lunch"
      ? "End lunch"
      : paused === "break"
        ? "End break"
        : "Clock out";
  const PrimaryIcon = !shift ? LogIn : paused ? Play : Square;
  const soFar = shift
    ? wagesFor(
        withPlanRates(shift, data.todayPlan),
        data.jobs,
        data.defaultPlan,
        now,
      )
    : 0;
  const timerMode = (
    <div
      className="chips timer-mode"
      role="group"
      aria-label="Shift timer direction"
    >
      {(["count-up", "count-down"] as const).map((mode) => (
        <button
          key={mode}
          disabled={busy}
          aria-pressed={data.todayPlan.timerDirection === mode}
          onClick={() => void commit(updateTodayPlan({ timerDirection: mode }))}
        >
          {mode === "count-up" ? "Count up" : "Count down"}
        </button>
      ))}
    </div>
  );
  return (
    <section
      className={`card hero tracker-clock ${shift ? "is-active" : "is-idle"}${paused ? ` is-${paused}` : ""}`}
      aria-label="Shift clock"
    >
      {!shift && (
        <p className="clock-ready">
          {data.history.some(
            (entry) => entry.date === localDate(new Date(now)) && entry.endedAt,
          )
            ? "Shift complete — ready for another?"
            : "Ready to start your shift"}
        </p>
      )}
      {data.jobs.filter((item) => !item.archived).length > 1 && (
        <label className="job-select">
          <span>Job for this shift</span>
          <select
            disabled={
              busy || Boolean(shift) || Boolean(data.extraShifts.length)
            }
            value={data.selectedJobId}
            onChange={(event) => void commit(selectJob(event.target.value))}
          >
            {data.jobs
              .filter((item) => !item.archived)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {shift && timerMode}
      {shift && (
        <div className="clock-reading">
          <div className="eyebrow">
            {paused && <Pause size={13} aria-hidden="true" />}
            {paused === "break"
              ? "On break"
              : paused === "lunch"
                ? "On lunch"
                : countdown
                  ? (metrics.projected ?? now) < now
                    ? "Past planned end"
                    : "Time remaining"
                  : "Time working"}
          </div>
          <div className="timer mono active" aria-live="off">
            {formatDuration(seconds)}
          </div>
          {!paused && data.payVisible && (
            <p className="clock-earnings">~{fmt(soFar)} so far</p>
          )}
          <p className="clock-meta">
            {job?.name ?? "No job selected"} · Clocked in at{" "}
            {time(shift.startedAt)}
          </p>
          {paused === "break" && shift.breakLabel && (
            <p className="clock-meta">{shift.breakLabel}</p>
          )}
        </div>
      )}
      <button
        type="button"
        className={`clock-button clock-primary ${!shift ? "primary" : paused ? `resume-${paused}` : "clock-stop"}`}
        disabled={busy || (!shift && Boolean(data.orphanedShift))}
        onClick={() => {
          if (!shift) void begin();
          else if (paused === "lunch") changeLunch();
          else if (paused === "break") changeBreak();
          else requestFinish(shift.id);
        }}
      >
        <span>
          <PrimaryIcon size={20} aria-hidden="true" />
          {primaryLabel}
        </span>
        {shift && !paused && metrics.projected && (
          <small aria-hidden="true">
            Estimated finish {time(metrics.projected)}
          </small>
        )}
      </button>
      {!shift && timerMode}
      {shift && (
        <div className="actions clock-secondary">
          {paused ? (
            <button
              className="danger"
              disabled={busy}
              onClick={() => requestFinish(shift.id)}
            >
              <Square size={15} aria-hidden="true" />
              Clock out
            </button>
          ) : (
            <>
              <button disabled={busy} onClick={changeLunch}>
                <Utensils size={15} aria-hidden="true" />
                Start lunch
              </button>
              <button disabled={busy} onClick={changeBreak}>
                <Pause size={15} aria-hidden="true" />
                Take break
              </button>
            </>
          )}
        </div>
      )}
      {shift && !paused && (
        <div className="break-label">
          <Field
            label="Break label (optional)"
            value={breakLabel}
            placeholder="General break"
            onChange={(event) => setBreakLabel(event.target.value)}
          />
        </div>
      )}
    </section>
  );
}

export function ShiftProgress({ now }: { now: number }) {
  const { data, busy, commit, shift, metrics, time } = useDisplay(now);
  return (
    <>
      {" "}
      {shift && (
        <section className="card progress-card">
          <div className="section-heading">
            <h2>
              <TrendingUp size={17} /> Shift Progress
            </h2>
            <small>{metrics.progress}% of planned work</small>
          </div>
          <div
            className="progress-bar"
            role="progressbar"
            aria-label="Shift progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={metrics.progress}
          >
            <span style={{ width: `${metrics.progress}%` }} />
          </div>
          <div className="stats">
            <div>
              <small>Worked</small>
              <strong className="mono">{formatDuration(metrics.worked)}</strong>
            </div>
            <div>
              <small>
                {data.breakIncludedInRemaining
                  ? "Work + upcoming lunch remaining"
                  : "Work remaining"}
              </small>
              <strong className="mono">
                {formatDuration(
                  data.breakIncludedInRemaining
                    ? metrics.remainingTotal
                    : metrics.remainingWork,
                )}
              </strong>
            </div>
            <div>
              <small>Estimated clock-out</small>
              <strong>
                {metrics.projected ? time(metrics.projected) : "—"}
              </strong>
            </div>
          </div>
          <Toggle
            label="Include upcoming lunch in remaining time"
            checked={data.breakIncludedInRemaining}
            disabled={busy}
            onChange={(value) => void commit(updateBreakPreference(value))}
          />
        </section>
      )}
    </>
  );
}
export function AdditionalShifts({
  now,
  requestFinish,
}: {
  now: number;
  requestFinish: (id: string) => void;
}) {
  const { data, busy, commit, shift } = useDisplay(now);
  return (
    <>
      {" "}
      {(data.extraShifts.length > 0 ||
        (shift &&
          data.preferences.allowConcurrentShifts &&
          data.isPremium &&
          data.jobs.filter((item) => !item.archived).length > 1)) && (
        <section className="card progress-card">
          <h2>Additional Active Shifts</h2>
          {data.extraShifts.map((extra) => (
            <div className="shift-row" key={extra.id}>
              <div>
                <h3>
                  {data.jobs.find((item) => item.id === extra.jobId)?.name ??
                    "Additional job"}
                </h3>
                <small>
                  {formatDuration(workedMinutes(extra, now) * 60)} worked
                </small>
              </div>
              <button
                disabled={busy}
                className="danger"
                onClick={() => requestFinish(extra.id)}
              >
                Clock out
              </button>
            </div>
          ))}
          {data.isPremium &&
            data.preferences.allowConcurrentShifts &&
            data.jobs
              .filter(
                (item) =>
                  !item.archived &&
                  item.id !== shift?.jobId &&
                  !data.extraShifts.some((extra) => extra.jobId === item.id),
              )
              .map((item) => (
                <button
                  key={item.id}
                  disabled={busy}
                  onClick={() =>
                    void commit(
                      startExtraShift(
                        withPlanRates(
                          newShift(
                            item.id,
                            item.currency ?? data.preferences.currency,
                          ),
                          jobPlan(item, data.defaultPlan),
                        ),
                      ),
                    )
                  }
                >
                  Start {item.name}
                </button>
              ))}
        </section>
      )}
    </>
  );
}
