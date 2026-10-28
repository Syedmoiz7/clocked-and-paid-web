import type { AppState, MockJob, Shift, TodayPlan } from "../../types";
import { localDate, validDate } from "../../utils/dateOnly";
import { jobPlan } from "../jobs/model";
import { timeValue, wagesFor, workedMinutes } from "../history/model";

export type ManualTimes = {
  start: string;
  lunchStart: string;
  lunchEnd: string;
  end: string;
  clearLunch?: boolean;
};
export function manualEntryAction(
  shift: Shift | null,
  times: ManualTimes,
  editing: boolean,
) {
  if (editing)
    return {
      title: "Save correction",
      hint: "Update this completed shift. Its recorded breaks, tips and pay settings are kept.",
    };
  if (times.end)
    return {
      title: "Save completed shift",
      hint: shift
        ? "This will end the running shift at the selected clock-out time."
        : "Save these times as a completed shift in History and Today's Summary.",
    };
  if (shift)
    return {
      title: "Save adjustments",
      hint: "Update the recorded times and keep this shift running.",
    };
  return {
    title: "Start shift from these times",
    hint: "Start a running shift at the selected clock-in time. Add Clock Out instead to save completed work.",
  };
}
export function completedShiftTotals(
  shift: Shift,
  jobs: MockJob[],
  plan: TodayPlan,
  defaultCurrency: string,
) {
  const wages = wagesFor(shift, jobs, plan),
    tips = shift.entryType === "project" ? 0 : (shift.tips ?? 0);
  return {
    wages,
    tips,
    total: wages + tips,
    workedSeconds: workedMinutes(shift) * 60,
    currency:
      shift.currency ??
      jobs.find((job) => job.id === shift.jobId)?.currency ??
      defaultCurrency,
  };
}
export function recoveryEndAt(date: string, time: string): string | null {
  if (!validDate(date) || parseTime(time) === null) return null;
  const parsed = new Date(`${date}T${time}:00`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    localDate(parsed) !== date ||
    timeValue(parsed.toISOString()) !== time
  )
    return null;
  return parsed.toISOString();
}
export function prepareRecovery(
  shift: Shift,
  endedAt: string,
  data: Pick<AppState, "jobs" | "defaultPlan" | "todayPlan">,
  now = Date.now(),
):
  | { error: string }
  | { entry: Shift; elapsedSeconds: number; workedSeconds: number } {
  if (shift.missingClockIn || shift.entryType === "project")
    return { error: "A recorded clock-in is required to recover a shift." };
  const end = Date.parse(endedAt),
    start = Date.parse(shift.startedAt);
  if (
    shift.endedAt ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end > now
  )
    return {
      error: "Clock-out must be after clock-in and cannot be in the future.",
    };
  if (
    [
      shift.lunchStartedAt,
      shift.historyLunchStart,
      shift.historyLunchEnd,
      shift.breakStartedAt,
      ...(shift.breaks ?? []).flatMap((item) => [item.start, item.end]),
    ].some(
      (value) =>
        value &&
        (!Number.isFinite(Date.parse(value)) ||
          Date.parse(value) > end ||
          Date.parse(value) < start),
    )
  )
    return {
      error: "The shift range must include the recorded lunch and breaks.",
    };
  const entry = finishShift(
    {
      ...shift,
      lunchStartedAt:
        shift.lunchStartedAt ??
        (shift.historyLunchStart && !shift.historyLunchEnd
          ? shift.historyLunchStart
          : null),
    },
    new Date(end).toISOString(),
    data,
  );
  const elapsedSeconds = (end - start) / 1000;
  if (
    ![entry.lunchMinutes, entry.breakMinutes, entry.earnings].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  )
    return {
      error: "The recorded shift has invalid amounts or pause durations.",
    };
  if (
    (entry.lunchPaid ? 0 : entry.lunchMinutes) + entry.breakMinutes >
    elapsedSeconds / 60
  )
    return {
      error: "Unpaid lunch and breaks cannot exceed the shift duration.",
    };
  return { entry, elapsedSeconds, workedSeconds: workedMinutes(entry) * 60 };
}
export function parseTime(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  return h! * 60 + m!;
}
export function formatTime(minutes: number) {
  const value = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export function formatDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
const minutesBetween = (start: string, end: string) =>
  Math.max(0, (Date.parse(end) - Date.parse(start)) / 60000);
export function withPlanRates(shift: Shift, plan: TodayPlan): Shift {
  return {
    ...shift,
    customRate: plan.hourlyRate,
    overtimeThreshold: plan.overtimeThreshold,
    overtimeMultiplier: plan.overtimeMultiplier,
  };
}
export function closePauses(shift: Shift, at: string): Shift {
  const result = {
    ...shift,
    breaks: shift.breaks?.map((item) =>
      item.end ? item : { ...item, end: at },
    ),
  };
  if (shift.lunchStartedAt) {
    result.lunchMinutes += minutesBetween(shift.lunchStartedAt, at);
    result.historyLunchStart = shift.historyLunchStart ?? shift.lunchStartedAt;
    result.historyLunchEnd = at;
  }
  const openBreaks = shift.breaks?.filter((item) => !item.end) ?? [];
  if (openBreaks.length)
    result.breakMinutes += openBreaks.reduce(
      (sum, item) => sum + minutesBetween(item.start, at),
      0,
    );
  else if (shift.breakStartedAt)
    result.breakMinutes += minutesBetween(shift.breakStartedAt, at);
  result.lunchStartedAt = null;
  result.breakStartedAt = null;
  return result;
}
export function completedShift(shift: Shift, at: string): Shift {
  const result = { ...closePauses(shift, at), endedAt: at };
  return result;
}
export function trackerMetrics(
  shift: Shift | null,
  plan: TodayPlan,
  now: number,
) {
  const worked = shift ? Math.floor(workedMinutes(shift, now) * 60) : 0;
  const liveLunch = shift?.lunchStartedAt
    ? minutesBetween(shift.lunchStartedAt, new Date(now).toISOString()) * 60
    : 0;
  const liveBreak = shift?.breakStartedAt
    ? minutesBetween(shift.breakStartedAt, new Date(now).toISOString()) * 60
    : 0;
  const lunch = (shift?.lunchMinutes ?? 0) * 60 + liveLunch;
  const breaks = (shift?.breakMinutes ?? 0) * 60 + liveBreak;
  const plannedLunch =
    plan.lunchEnabled && !shift?.lunchPaid ? plan.lunchMinutes * 60 : 0;
  const lunchDone = Boolean(
    shift?.historyLunchEnd || (!shift?.lunchStartedAt && shift?.lunchMinutes),
  );
  const pendingLunch = lunchDone ? 0 : Math.max(0, plannedLunch - liveLunch);
  const remainingWork = Math.max(0, plan.plannedHours * 3600 - worked);
  const projected = shift
    ? Date.parse(shift.startedAt) +
      (plan.plannedHours * 3600 +
        (shift.lunchPaid
          ? 0
          : lunchDone
            ? lunch
            : Math.max(plannedLunch, lunch)) +
        breaks) *
        1000
    : null;
  const regular = Math.min(worked, plan.overtimeThreshold * 3600);
  return {
    worked,
    lunch,
    breaks,
    liveLunch,
    liveBreak,
    pendingLunch,
    remainingWork,
    remainingTotal: remainingWork + pendingLunch,
    projected,
    regular,
    overtime: Math.max(0, worked - regular),
    progress:
      plan.plannedHours > 0
        ? Math.min(100, Math.round((worked / (plan.plannedHours * 3600)) * 100))
        : 0,
    gross: shift ? wagesFor(withPlanRates(shift, plan), [], plan, now) : 0,
  };
}
export function planChanges(
  plan: TodayPlan,
  changes: Partial<TodayPlan>,
  shift: Shift | null,
  now = new Date(),
): TodayPlan | null {
  const next = { ...plan, ...changes };
  if (next.planningMode === "end-time" && next.plannedClockOut) {
    const start = parseTime(
      shift ? timeValue(shift.startedAt) : timeValue(now.toISOString()),
    );
    const end = parseTime(next.plannedClockOut);
    if (start === null || end === null) return null;
    let span = end - start;
    if (span <= 0) span += 1440;
    const completedLunch = Boolean(
      shift?.historyLunchEnd || (shift?.lunchMinutes && !shift.lunchStartedAt),
    );
    const lunch = shift?.lunchPaid
      ? 0
      : completedLunch
        ? shift!.lunchMinutes
        : next.lunchEnabled
          ? next.lunchMinutes
          : 0;
    next.plannedHours = Math.max(0, span - lunch) / 60;
  }
  if (
    ![
      next.plannedHours,
      next.hourlyRate,
      next.lunchMinutes,
      next.overtimeThreshold,
      next.overtimeMultiplier,
    ].every(Number.isFinite) ||
    next.plannedHours < 0 ||
    next.plannedHours > 24 ||
    next.hourlyRate < 0 ||
    next.lunchMinutes < 0 ||
    next.lunchMinutes > 180 ||
    next.overtimeThreshold <= 0 ||
    next.overtimeThreshold > 24 ||
    next.overtimeMultiplier < 1 ||
    next.overtimeMultiplier > 4
  )
    return null;
  return next;
}
export type CalculatorDraft = {
  mode: "times" | "hours";
  start: string;
  end: string;
  hours: string;
  lunchEnabled: boolean;
  lunchMinutes: string;
};
export type CalculatorResult = {
  hours: number;
  workMinutes: number;
  lunchMinutes: number;
  dayOffset: number;
};
export function calculateHours(
  draft: CalculatorDraft,
): { error: string } | CalculatorResult {
  if (draft.mode === "hours") {
    const hours = Number(draft.hours);
    if (
      !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(draft.hours.trim()) ||
      !Number.isFinite(hours) ||
      hours <= 0 ||
      hours > 24
    )
      return { error: "Choose paid work hours greater than 0 and at most 24." };
    const workMinutes = Math.round(hours * 60);
    if (workMinutes < 1)
      return { error: "Choose at least one minute of work." };
    return {
      hours: workMinutes / 60,
      workMinutes,
      lunchMinutes: 0,
      dayOffset: 0,
    };
  }
  const start = parseTime(draft.start),
    end = parseTime(draft.end);
  if (start === null || end === null)
    return {
      error:
        "Choose both a start and end time to calculate worked hours and pay.",
    };
  if (start === end)
    return {
      error:
        "Start and end must differ. Choose paid work hours for a full 24-hour calculation.",
    };
  const lunch = draft.lunchEnabled ? Number(draft.lunchMinutes) : 0;
  if (
    !Number.isInteger(lunch) ||
    lunch < 0 ||
    lunch > 180 ||
    (draft.lunchEnabled && !/^\d+$/.test(draft.lunchMinutes.trim()))
  )
    return { error: "Enter a whole lunch duration from 0 to 180 minutes." };
  const dayOffset = end < start ? 1 : 0;
  const span = end - start + dayOffset * 1440;
  if (lunch >= span)
    return { error: "Lunch must be shorter than the selected interval." };
  const workMinutes = span - lunch;
  return {
    hours: workMinutes / 60,
    workMinutes,
    lunchMinutes: lunch,
    dayOffset,
  };
}

function atTime(date: string, time: string, after?: Date) {
  if (parseTime(time) === null) return null;
  const result = new Date(`${date}T${time}:00`);
  if (after && result < after) result.setDate(result.getDate() + 1);
  return Number.isFinite(result.getTime()) ? result : null;
}
export function manualShift(
  existing: Shift,
  times: ManualTimes,
  now = Date.now(),
): { error: string } | { shift: Shift } {
  const start = atTime(existing.date, times.start);
  if (!start) return { error: "Clock In is required. Choose a valid time." };
  const end = times.end ? atTime(existing.date, times.end, start) : null;
  if (times.end && !end) return { error: "Choose a valid Clock Out." };
  if (end && end <= start)
    return { error: "Clock Out must be after Clock In." };
  if (existing.endedAt && !end)
    return { error: "A completed shift needs its actual Clock Out." };
  if (!end && start.getTime() > now)
    return { error: "An active shift cannot start in the future." };
  const lunchStart = times.lunchStart
    ? atTime(existing.date, times.lunchStart, start)
    : null;
  const lunchEnd = times.lunchEnd
    ? atTime(existing.date, times.lunchEnd, lunchStart ?? start)
    : null;
  if (
    (times.lunchStart && !lunchStart) ||
    (times.lunchEnd && !lunchEnd) ||
    (lunchEnd && !lunchStart)
  )
    return { error: "Choose valid Lunch Start and Lunch End times." };
  const limit = end?.getTime() ?? now;
  if (
    (lunchStart && lunchStart.getTime() > limit) ||
    (lunchEnd && (lunchEnd.getTime() > limit || lunchEnd <= lunchStart!))
  )
    return {
      error: "Lunch must fall within the shift and end after it starts.",
    };
  let shift: Shift = {
    ...existing,
    startedAt: start.toISOString(),
    missingClockIn: false,
    endedAt: end?.toISOString() ?? null,
  };
  if (times.clearLunch)
    shift = {
      ...shift,
      lunchMinutes: 0,
      lunchStartedAt: null,
      historyLunchStart: null,
      historyLunchEnd: null,
    };
  else if (lunchStart)
    shift = {
      ...shift,
      lunchMinutes: lunchEnd
        ? minutesBetween(lunchStart.toISOString(), lunchEnd.toISOString())
        : 0,
      lunchStartedAt: lunchEnd ? null : lunchStart.toISOString(),
      historyLunchStart: lunchStart.toISOString(),
      historyLunchEnd: lunchEnd?.toISOString() ?? null,
    };
  if (end) shift = completedShift(shift, end.toISOString());
  if (
    shift.breaks?.some(
      (item) =>
        Date.parse(item.start) < start.getTime() ||
        Date.parse(item.end ?? new Date(limit).toISOString()) > limit,
    )
  )
    return {
      error:
        "The new shift range must contain its recorded breaks. Edit break details in History.",
    };
  const unpaid =
    (shift.lunchPaid ? 0 : shift.lunchMinutes) + shift.breakMinutes;
  if (unpaid > (limit - start.getTime()) / 60000)
    return { error: "Unpaid lunch and breaks cannot exceed the shift." };
  return { shift };
}

export function finishShift(
  source: Shift,
  at: string,
  data: Pick<AppState, "jobs" | "defaultPlan" | "todayPlan">,
  primary = false,
) {
  const job = data.jobs.find((job) => job.id === source.jobId);
  const fallback = job ? jobPlan(job, data.defaultPlan) : data.defaultPlan;
  const rated = primary
    ? withPlanRates(source, data.todayPlan)
    : {
        ...source,
        customRate: source.customRate ?? fallback.hourlyRate,
        overtimeThreshold:
          source.overtimeThreshold ?? fallback.overtimeThreshold,
        overtimeMultiplier:
          source.overtimeMultiplier ?? fallback.overtimeMultiplier,
      };
  const result = completedShift(rated, at);
  result.earnings = wagesFor(result, data.jobs, data.defaultPlan);
  return result;
}
