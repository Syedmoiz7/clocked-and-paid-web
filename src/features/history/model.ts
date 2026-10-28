import type {
  Deduction,
  MockJob,
  MockPaycheck,
  Shift,
  TodayPlan,
} from "../../types";
import { localDate, validDate } from "../../utils/dateOnly";
export { localDate, validDate } from "../../utils/dateOnly";
export const currencies = [
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "AUD",
  "JPY",
  "INR",
  "MXN",
  "BRL",
  "CHF",
];
export type Period = "all" | "week" | "lastWeek" | "month" | "year" | "custom";
export type HistoryFilters = {
  period: Period;
  from: string;
  to: string;
  jobId: string | null;
  unpaidOnly: boolean;
  type: "all" | "shifts" | "projects";
  earnings: "all" | "net" | "tips";
  excludeTips: boolean;
  excludeDeductions: boolean;
};
export type EntryDraft = {
  date: string;
  start: string;
  end: string;
  lunchStart: string;
  lunchEnd: string;
  lunchMinutes: string;
  lunchPaid: boolean;
  breakMinutes: string;
  breakLabel: string;
  breaks: NonNullable<Shift["breaks"]>;
  entryType: "shift" | "project";
  projectName: string;
  endDate: string;
  flatAmount: string;
  currency: string;
  jobId: string | null;
  notes: string;
  paid: boolean;
  tips: string;
  tipType: NonNullable<Shift["tipType"]>;
  customRate: string;
};
export function timeValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
    : "";
}
export function blankDraft(type: EntryDraft["entryType"]): EntryDraft {
  const date = new Date();
  if (type === "shift") date.setDate(date.getDate() - 1);
  return {
    date: localDate(date),
    start: "",
    end: "",
    lunchStart: "",
    lunchEnd: "",
    lunchMinutes: "0",
    lunchPaid: false,
    breakMinutes: "0",
    breakLabel: "",
    breaks: [],
    entryType: type,
    projectName: "",
    endDate: localDate(date),
    flatAmount: "",
    currency: "USD",
    jobId: null,
    notes: "",
    paid: false,
    tips: "0",
    tipType: "cash",
    customRate: "",
  };
}
export function draftForEntry(shift: Shift): EntryDraft {
  return {
    ...blankDraft(shift.entryType ?? "shift"),
    date: shift.date,
    start: shift.missingClockIn ? "" : timeValue(shift.startedAt),
    end: timeValue(shift.endedAt),
    lunchStart: timeValue(shift.historyLunchStart),
    lunchEnd: timeValue(shift.historyLunchEnd),
    lunchMinutes: String(shift.lunchMinutes),
    lunchPaid: shift.lunchPaid ?? false,
    breakMinutes: String(shift.breakMinutes),
    breakLabel: shift.breakLabel ?? "",
    breaks: shift.breaks ?? [],
    projectName: shift.projectName ?? "",
    endDate: shift.endDate ?? shift.date,
    flatAmount: String(shift.flatAmount ?? shift.earnings),
    currency: shift.currency ?? "USD",
    jobId: shift.jobId ?? null,
    notes: shift.projectNotes ?? "",
    paid:
      shift.entryType === "project" || (!shift.missingClockIn && shift.endedAt)
        ? (shift.paid ?? false)
        : false,
    tips: String(shift.tips ?? 0),
    tipType: shift.tipType ?? "cash",
    customRate: shift.customRate == null ? "" : String(shift.customRate),
  };
}
export function workedMinutes(shift: Shift, now?: number) {
  if (
    shift.entryType === "project" ||
    shift.missingClockIn ||
    (!shift.endedAt && now == null)
  )
    return 0;
  const end = shift.endedAt ? Date.parse(shift.endedAt) : now!;
  const lunch = shift.lunchPaid
    ? 0
    : shift.lunchMinutes +
      (!shift.endedAt && shift.lunchStartedAt
        ? Math.max(0, (end - Date.parse(shift.lunchStartedAt)) / 60000)
        : 0);
  const breaks =
    shift.breakMinutes +
    (!shift.endedAt && shift.breakStartedAt
      ? Math.max(0, (end - Date.parse(shift.breakStartedAt)) / 60000)
      : 0);
  return Math.max(
    0,
    (end - Date.parse(shift.startedAt)) / 60000 - lunch - breaks,
  );
}
export function rateFor(shift: Shift, jobs: MockJob[], plan: TodayPlan) {
  return (
    shift.customRate ??
    jobs.find((job) => job.id === shift.jobId)?.hourlyRate ??
    plan.hourlyRate
  );
}
export function wagesFor(
  shift: Shift,
  jobs: MockJob[],
  plan: TodayPlan,
  now?: number,
) {
  if (shift.entryType === "project") return shift.flatAmount ?? shift.earnings;
  const minutes = workedMinutes(shift, now);
  const job = jobs.find((job) => job.id === shift.jobId);
  const regular = Math.min(
    minutes,
    (shift.overtimeThreshold ??
      job?.overtimeThreshold ??
      plan.overtimeThreshold) * 60,
  );
  return (
    ((regular +
      Math.max(0, minutes - regular) *
        (shift.overtimeMultiplier ??
          job?.overtimeMultiplier ??
          plan.overtimeMultiplier)) /
      60) *
    rateFor(shift, jobs, plan)
  );
}
function atTime(date: string, time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const value = new Date(`${date}T${time}:00`);
  return timeValue(value.toISOString()) === time ? value : null;
}
function nextDay(value: Date) {
  const next = new Date(value);
  next.setDate(next.getDate() + 1);
  return next;
}
export function prepareEntry(
  draft: EntryDraft,
  jobs: MockJob[],
  plan: TodayPlan,
  existing?: Shift,
  defaultCurrency = "USD",
):
  | {
      ok: true;
      entry: Shift;
    }
  | {
      ok: false;
      error: string;
    } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!validDate(draft.date)) return fail("Enter a valid date (YYYY-MM-DD).");
  const amount = (value: string) =>
    value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
  const base = {
    ...existing,
    id:
      existing?.id ??
      `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: draft.date,
    entryType: draft.entryType,
    jobId: draft.jobId,
    projectNotes: draft.notes.trim() || null,
    paid: draft.paid,
    paidAt: draft.paid ? (existing?.paidAt ?? new Date().toISOString()) : null,
    currency:
      draft.entryType === "project"
        ? draft.currency
        : ((existing?.jobId === draft.jobId ? existing?.currency : undefined) ??
          jobs.find((job) => job.id === draft.jobId)?.currency ??
          defaultCurrency),
  };
  if (!currencies.includes(draft.currency))
    return fail("Choose a supported currency.");
  if (draft.entryType === "project") {
    if (!draft.projectName.trim()) return fail("Project name is required.");
    if (!amount(draft.flatAmount))
      return fail("Enter a valid flat payout amount.");
    if (
      draft.endDate &&
      (!validDate(draft.endDate) || draft.endDate < draft.date)
    )
      return fail("End date must be on or after the start date.");
    return {
      ok: true,
      entry: {
        ...base,
        projectName: draft.projectName.trim(),
        endDate: draft.endDate || null,
        flatAmount: Number(draft.flatAmount),
        earnings: Number(draft.flatAmount),
        startedAt: `${draft.date}T12:00:00`,
        endedAt: null,
        lunchMinutes: 0,
        breakMinutes: 0,
        tips: 0,
      },
    };
  }
  if (!draft.start && !draft.end)
    return fail("Enter at least a Clock In or Clock Out time.");
  if (
    existing?.endedAt &&
    !existing.missingClockIn &&
    (!draft.start || !draft.end)
  )
    return fail(
      "Enter both Clock In and actual Clock Out to complete the correction.",
    );
  if (
    [draft.start, draft.end, draft.lunchStart, draft.lunchEnd].some(
      (time) => time && !atTime(draft.date, time),
    )
  )
    return fail("Choose valid clock and lunch times.");
  if (Boolean(draft.lunchStart) !== Boolean(draft.lunchEnd))
    return fail("Enter both Lunch Start and Lunch End, or clear both.");
  if (
    ![draft.lunchMinutes, draft.breakMinutes, draft.tips].every(amount) ||
    (draft.customRate !== "" && !amount(draft.customRate))
  )
    return fail("Amounts and durations must be valid non-negative numbers.");
  const clockTime = (time: string, recorded?: string | null) =>
    existing?.date === draft.date &&
    time &&
    recorded &&
    time === timeValue(recorded)
      ? new Date(recorded)
      : atTime(draft.date, time);
  const start = clockTime(draft.start, existing?.startedAt);
  let end = clockTime(draft.end, existing?.endedAt);
  if (start && end && end < start) end = nextDay(end);
  if (start && end && end.getTime() === start.getTime())
    return fail("Clock Out must be different from Clock In.");
  if (draft.paid && (!start || !end))
    return fail("Complete both clock times before marking a shift paid.");
  let lunchStart = clockTime(draft.lunchStart, existing?.historyLunchStart);
  let lunchEnd = clockTime(draft.lunchEnd, existing?.historyLunchEnd);
  if (
    start &&
    lunchStart &&
    lunchStart < start &&
    end &&
    localDate(end) !== draft.date
  )
    lunchStart = nextDay(lunchStart);
  if (
    start &&
    lunchEnd &&
    lunchEnd < start &&
    end &&
    localDate(end) !== draft.date
  )
    lunchEnd = nextDay(lunchEnd);
  if (lunchStart && lunchEnd && lunchEnd < lunchStart)
    lunchEnd = nextDay(lunchEnd);
  if (
    (end && timeValue(end.toISOString()) !== draft.end) ||
    (lunchStart && timeValue(lunchStart.toISOString()) !== draft.lunchStart) ||
    (lunchEnd && timeValue(lunchEnd.toISOString()) !== draft.lunchEnd)
  )
    return fail(
      "A selected time does not exist on that date because the clocks change. Choose another time.",
    );
  if (
    lunchStart &&
    lunchEnd &&
    (lunchEnd <= lunchStart ||
      (start && lunchStart < start) ||
      (end && lunchEnd > end))
  )
    return fail("Lunch must fall within the shift, with End after Start.");
  const lunchMinutes =
    lunchStart && lunchEnd
      ? (lunchEnd.getTime() - lunchStart.getTime()) / 60000
      : Number(draft.lunchMinutes);
  const breakMinutes = Number(draft.breakMinutes);
  if (draft.breaks.length && start && end) {
    const intervals = draft.breaks
      .map((item) => ({
        start: Date.parse(item.start),
        end: item.end ? Date.parse(item.end) : NaN,
      }))
      .sort((a, b) => a.start - b.start);
    if (
      intervals.some(
        (item, index) =>
          !Number.isFinite(item.start) ||
          !Number.isFinite(item.end) ||
          item.end <= item.start ||
          item.start < start.getTime() ||
          item.end > end.getTime() ||
          (index > 0 && item.start < intervals[index - 1]!.end) ||
          (lunchStart &&
            lunchEnd &&
            item.start < lunchEnd.getTime() &&
            item.end > lunchStart.getTime()),
      )
    )
      return fail(
        "Recorded breaks must be within the shift and cannot overlap each other or lunch. Replace them with total minutes to correct the record.",
      );
    const recorded = intervals.reduce(
      (sum, item) => sum + (item.end - item.start) / 60000,
      0,
    );
    if (Math.abs(recorded - breakMinutes) > 0.02)
      return fail(
        "Break minutes differ from the recorded breaks. Use the recorded total or replace the records with total minutes.",
      );
  }
  if (
    start &&
    end &&
    (!draft.lunchPaid ? lunchMinutes : 0) + breakMinutes >
      (end.getTime() - start.getTime()) / 60000
  )
    return fail("Unpaid lunch and breaks cannot exceed the shift duration.");
  const entry: Shift = {
    ...base,
    startedAt: start?.toISOString() ?? "",
    missingClockIn: !start,
    endedAt: end?.toISOString() ?? null,
    historyLunchStart: lunchStart?.toISOString() ?? null,
    historyLunchEnd: lunchEnd?.toISOString() ?? null,
    lunchStartedAt: null,
    breakStartedAt: null,
    lunchMinutes,
    lunchPaid: draft.lunchPaid,
    breakMinutes,
    breakLabel: draft.breakLabel || null,
    breaks: draft.breaks,
    tips: Number(draft.tips),
    tipType: draft.tipType,
    customRate: draft.customRate === "" ? null : Number(draft.customRate),
    earnings: 0,
  };
  if (existing?.jobId !== draft.jobId) {
    const job = jobs.find((job) => job.id === draft.jobId);
    entry.overtimeThreshold = job?.overtimeThreshold ?? plan.overtimeThreshold;
    entry.overtimeMultiplier =
      job?.overtimeMultiplier ?? plan.overtimeMultiplier;
  }
  entry.earnings = wagesFor(entry, jobs, plan);
  return { ok: true, entry };
}
export function defaultFilters(): HistoryFilters {
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return {
    period: "all",
    from: localDate(from),
    to: localDate(),
    jobId: null,
    unpaidOnly: false,
    type: "all",
    earnings: "all",
    excludeTips: false,
    excludeDeductions: false,
  };
}
export function filterEntries(
  history: Shift[],
  filters: HistoryFilters,
  activeId?: string,
  now = new Date(),
) {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  if (filters.period === "lastWeek") monday.setDate(monday.getDate() - 7);
  const next = new Date(monday);
  next.setDate(next.getDate() + 7);
  return history.filter((entry) => {
    if (
      entry.id === activeId ||
      (filters.jobId && entry.jobId !== filters.jobId) ||
      (filters.unpaidOnly && entry.paid)
    )
      return false;
    if (
      filters.type !== "all" &&
      (filters.type === "projects"
        ? entry.entryType !== "project"
        : entry.entryType === "project")
    )
      return false;
    const date = new Date(`${entry.date}T12:00:00`);
    switch (filters.period) {
      case "custom":
        return (
          validDate(filters.from) &&
          validDate(filters.to) &&
          filters.from <= filters.to &&
          entry.date >= filters.from &&
          entry.date <= filters.to
        );
      case "week":
      case "lastWeek":
        return date >= monday && date < next;
      case "month":
        return (
          date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth()
        );
      case "year":
        return date.getFullYear() === now.getFullYear();
      default:
        return true;
    }
  });
}
export function entitledEntries(
  entries: Shift[],
  premium: boolean,
  now = new Date(),
) {
  return premium
    ? entries
    : entries.filter(
        (entry) => entry.date.slice(0, 7) === localDate(now).slice(0, 7),
      );
}
export function periodDeductions(
  deductions: Deduction[],
  entries: Shift[],
  jobId: string | null,
) {
  if (!entries.length) return 0;
  const dates = entries.map((entry) => entry.date);
  const weeks = new Set(
    dates.map((date) => {
      const monday = new Date(`${date}T12:00:00`);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      return localDate(monday);
    }),
  );
  return deductions
    .filter(
      (item) => item.enabled && (!item.jobId || !jobId || item.jobId === jobId),
    )
    .reduce((sum, item) => {
      const counts = {
        daily: dates.length,
        weekly: weeks.size,
        "per-pay-period": Math.max(1, Math.ceil(weeks.size / 2)),
        monthly: new Set(dates.map((date) => date.slice(0, 7))).size,
        yearly: new Set(dates.map((date) => date.slice(0, 4))).size,
        "one-time": 1,
      };
      return sum + item.amount * counts[item.frequency];
    }, 0);
}
export function paymentStatus(
  entry: Shift,
  paychecks: MockPaycheck[],
  jobs: MockJob[],
) {
  if (entry.entryType !== "project" && (entry.missingClockIn || !entry.endedAt))
    return "Incomplete";
  if (
    entry.entryType !== "project" &&
    paychecks.some(
      (paycheck) =>
        paycheck.paid &&
        paycheck.jobId === entry.jobId &&
        (!paycheck.currency ||
          paycheck.currency ===
            (entry.currency ??
              jobs.find((job) => job.id === entry.jobId)?.currency ??
              "USD")) &&
        entry.date >= paycheck.startDate &&
        entry.date <= paycheck.endDate,
    )
  )
    return "Paid via Paycheck";
  if (
    entry.entryType !== "project" &&
    !entry.paid &&
    jobs.find((job) => job.id === entry.jobId)?.payFrequency
  )
    return "Pending Paycheck";
  return entry.paid ? "Paid" : "Unpaid";
}
export function selectable(
  entry: Shift,
  paychecks: MockPaycheck[],
  jobs: MockJob[],
) {
  return (
    entry.entryType !== "project" &&
    !entry.missingClockIn &&
    Boolean(entry.endedAt) &&
    !entry.paid &&
    paymentStatus(entry, paychecks, jobs) !== "Paid via Paycheck"
  );
}
export function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amount,
  );
}
export function duration(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${Math.floor(minutes % 60)}m`;
}
export function csvFor(
  entries: Shift[],
  jobs: MockJob[],
  plan: TodayPlan,
  defaultCurrency = "USD",
  paychecks: MockPaycheck[] = [],
) {
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [
    "date,type,project,end_date,currency,job,clock_in,clock_out,worked_minutes,wages,tips,paid,notes,id,job_id,tip_type,lunch_minutes,break_minutes,custom_rate",
    ...entries.map((entry) =>
      [
        entry.date,
        entry.entryType ?? "shift",
        entry.projectName,
        entry.endDate,
        entry.currency ??
          jobs.find((job) => job.id === entry.jobId)?.currency ??
          defaultCurrency,
        jobs.find((job) => job.id === entry.jobId)?.name,
        entry.missingClockIn || entry.entryType === "project"
          ? ""
          : entry.startedAt,
        entry.entryType === "project" ? "" : entry.endedAt,
        workedMinutes(entry),
        wagesFor(entry, jobs, plan).toFixed(2),
        entry.tips ?? 0,
        paymentStatus(entry, paychecks, jobs).startsWith("Paid") ? "yes" : "no",
        entry.projectNotes,
        entry.id,
        entry.jobId,
        entry.tipType,
        entry.lunchMinutes,
        entry.breakMinutes,
        entry.customRate,
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\r\n");
}
