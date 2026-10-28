import type {
  AppState,
  Deduction,
  MockJob,
  MockPaycheck,
  PaySchedule,
  Shift,
} from "../../types";
import { localDate, validDate } from "../../utils/dateOnly";
import { addDays } from "../history/payPeriods";
import { csvFor } from "../history/model";
import { validateJob, validTime } from "../jobs/model";
import { workInProgress } from "../jobs/model";
import { preserveWorkspacePricing } from "./drafts";
import {
  validateDeduction,
  validateReceipt,
  validateSchedule,
} from "../pay/model";
import {
  preferenceDefaults,
  validateSettings,
  type SettingsDraft,
} from "./model";

const MAX_SIZE = 10 * 1024 * 1024;
const plain = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const pick = (value: Record<string, any>, fields: string[]) =>
  Object.fromEntries(
    fields
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
const string = (value: unknown) =>
  typeof value === "string" && value.length <= 100000;
const amount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const id = (value: unknown) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 250 &&
  !["__proto__", "constructor", "prototype"].includes(value);
const stamp = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const shiftFields =
  "id date startedAt endedAt lunchMinutes breakMinutes earnings tips tipType missingClockIn historyLunchStart historyLunchEnd breaks jobId breakLabel lunchStartedAt breakStartedAt entryType projectName endDate flatAmount currency projectNotes customRate overtimeThreshold overtimeMultiplier lunchPaid paid paidAt paidByPaycheckId".split(
    " ",
  );
const jobFields =
  "id name hourlyRate color currency payFrequency payPeriodStart payPeriodEnd nextPayDate payDelayDays overtimeThreshold overtimeMultiplier title notes isDefault archived lunchMinutes lunchEnabled enableTips reminderSettings createdAt".split(
    " ",
  );
const deductionFields =
  "id label amount currency frequency enabled jobId isPercentage beforeTax taxSetAside applicableFromDate applicableToDate payDate notes consumedByPaycheckId".split(
    " ",
  );
const receiptFields =
  "id jobId startDate endDate paid payDate grossPay totalDeductions netPay hoursWorked shiftCount notes currency createdAt".split(
    " ",
  );
const currencyOK = (value: unknown) =>
  value == null || (typeof value === "string" && /^[A-Z]{3}$/.test(value));
export type ImportData = {
  format: "mobile" | "web" | "csv";
  history: Shift[];
  jobs?: MockJob[];
  deductions?: Deduction[];
  paychecks?: MockPaycheck[];
  paySchedules?: Record<string, PaySchedule>;
  settings?: SettingsDraft;
  warnings: string[];
};

function timestamp(date: string, time: unknown, after?: string | null) {
  if (time == null || time === "") return null;
  if (typeof time !== "string" || !validTime(time))
    throw new Error("Invalid clock time in backup.");
  let value = new Date(`${date}T${time}:00`);
  if (after && value.getTime() < Date.parse(after))
    value = new Date(`${addDays(date, 1)}T${time}:00`);
  return value.toISOString();
}
export function importedShift(value: unknown): Shift {
  if (!plain(value) || !id(value.id) || !validDate(value.date))
    throw new Error("Invalid time entry ID or date.");
  let result: Shift;
  if ("startedAt" in value) result = pick(value, shiftFields) as Shift;
  else {
    const startedAt = timestamp(value.date, value.clockIn);
    const endedAt = timestamp(value.date, value.clockOut, startedAt);
    const lunchStart = timestamp(value.date, value.lunchStart, startedAt);
    const lunchEnd = timestamp(value.date, value.lunchEnd, lunchStart);
    const breaks = Array.isArray(value.breaks)
      ? value.breaks.map((item: any, index: number) => ({
          id: `${value.id}-break-${index}`,
          start: timestamp(value.date, item.start, startedAt)!,
          end: timestamp(
            value.date,
            item.end,
            timestamp(value.date, item.start, startedAt),
          ),
          label: item.label,
        }))
      : [];
    result = {
      id: value.id,
      date: value.date,
      startedAt: startedAt ?? `${value.date}T00:00:00`,
      endedAt,
      missingClockIn: !startedAt,
      lunchMinutes:
        lunchStart && lunchEnd
          ? (Date.parse(lunchEnd) - Date.parse(lunchStart)) / 60000
          : 0,
      breakMinutes: breaks.reduce(
        (sum: number, item: any) =>
          sum +
          (item.end
            ? (Date.parse(item.end) - Date.parse(item.start)) / 60000
            : 0),
        0,
      ),
      breaks,
      historyLunchStart: lunchStart,
      historyLunchEnd: lunchEnd,
      earnings: value.entryType === "project" ? (value.flatAmount ?? 0) : 0,
      paid: Boolean(value.isPaid),
      ...pick(
        value,
        "jobId tips tipType customRate entryType projectName endDate flatAmount currency projectNotes lunchPaid".split(
          " ",
        ),
      ),
    };
  }
  if (
    !stamp(result.startedAt) ||
    (result.endedAt != null &&
      (!stamp(result.endedAt) ||
        Date.parse(result.endedAt) < Date.parse(result.startedAt)))
  )
    throw new Error("Invalid shift time range.");
  for (const key of ["lunchMinutes", "breakMinutes", "earnings"] as const)
    if (!amount(result[key])) throw new Error(`Invalid entry ${key}.`);
  for (const key of ["tips", "customRate", "flatAmount"] as const)
    if (result[key] != null && !amount(result[key]))
      throw new Error(`Invalid entry ${key}.`);
  if (
    (result.overtimeThreshold != null &&
      (!amount(result.overtimeThreshold) ||
        result.overtimeThreshold <= 0 ||
        result.overtimeThreshold > 24)) ||
    (result.overtimeMultiplier != null &&
      (!amount(result.overtimeMultiplier) ||
        result.overtimeMultiplier < 1 ||
        result.overtimeMultiplier > 4))
  )
    throw new Error("Invalid entry overtime overrides.");
  if (
    !currencyOK(result.currency) ||
    (result.jobId != null && !id(result.jobId))
  )
    throw new Error("Invalid currency or job reference.");
  for (const key of ["paid", "lunchPaid", "missingClockIn"] as const)
    if (result[key] != null && typeof result[key] !== "boolean")
      throw new Error("Invalid shift flag.");
  for (const key of ["projectName", "projectNotes", "breakLabel"] as const)
    if (result[key] != null && !string(result[key]))
      throw new Error("Invalid entry text.");
  if (
    result.tipType &&
    !["cash", "paycheck", "card", "other"].includes(result.tipType)
  )
    throw new Error("Invalid tip type.");
  if (result.entryType && !["shift", "project"].includes(result.entryType))
    throw new Error("Invalid entry type.");
  if (
    result.endDate &&
    (!validDate(result.endDate) || result.endDate < result.date)
  )
    throw new Error("Invalid project end date.");
  if (result.breaks) {
    if (!Array.isArray(result.breaks)) throw new Error("Invalid breaks.");
    result.breaks = result.breaks.map((item) => {
      if (
        !plain(item) ||
        !id(item.id) ||
        !stamp(item.start) ||
        (item.end != null &&
          (!stamp(item.end) || Date.parse(item.end) < Date.parse(item.start)))
      )
        throw new Error("Invalid break range.");
      return pick(item, ["id", "start", "end", "label"]) as NonNullable<
        Shift["breaks"]
      >[number];
    });
  }
  // Imported unfinished records are drafts, never automatically restarted timers.
  return { ...result, lunchStartedAt: null, breakStartedAt: null };
}

function entries<T>(value: unknown, convert: (item: any) => T): T[] {
  if (!Array.isArray(value) || value.length > 50000)
    throw new Error("Invalid or oversized backup collection.");
  const result = value.map(convert);
  const ids = result.map((item) => (item as any).id);
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate record IDs in backup.");
  return result;
}
function importedJob(value: any): MockJob {
  if (
    !plain(value) ||
    !id(value.id) ||
    !string(value.name) ||
    typeof value.color !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(value.color)
  )
    throw new Error("Invalid job profile.");
  const job = pick(value, jobFields) as MockJob;
  for (const key of ["title", "notes"] as const)
    if (job[key] != null && !string(job[key]))
      throw new Error("Invalid job text.");
  for (const key of [
    "isDefault",
    "archived",
    "lunchEnabled",
    "enableTips",
  ] as const)
    if (job[key] != null && typeof job[key] !== "boolean")
      throw new Error("Invalid job flag.");
  if (validateJob(job)) throw new Error(validateJob(job)!);
  if (job.reminderSettings)
    job.reminderSettings = {
      ...job.reminderSettings,
      custom: job.reminderSettings.custom.map((item) =>
        pick(
          item,
          "id name message enabled trigger offsetMinutes atTime repeatMinutes priority".split(
            " ",
          ),
        ),
      ),
    } as MockJob["reminderSettings"];
  return job;
}
function importedDeduction(value: any): Deduction {
  if (!plain(value) || !id(value.id)) throw new Error("Invalid deduction.");
  const item = pick(value, deductionFields) as Deduction;
  item.label = value.label ?? value.name;
  item.amount = value.amount ?? value.percentage;
  item.frequency ??= "per-pay-period";
  item.enabled ??= true;
  if (
    item.isPercentage == null &&
    value.amount == null &&
    value.percentage != null
  )
    item.isPercentage = true;
  if (
    ![
      "daily",
      "weekly",
      "per-pay-period",
      "monthly",
      "yearly",
      "one-time",
    ].includes(item.frequency) ||
    typeof item.enabled !== "boolean"
  )
    throw new Error("Invalid deduction frequency or enabled flag.");
  if (!string(item.label) || validateDeduction(item))
    throw new Error("Invalid deduction amounts, dates or name.");
  return item;
}
function importedReceipt(value: any): MockPaycheck {
  if (!plain(value) || !id(value.id) || !id(value.jobId))
    throw new Error("Invalid received paycheck.");
  const item = pick(value, receiptFields) as MockPaycheck;
  if (typeof item.paid !== "boolean")
    throw new Error("Invalid paycheck payment flag.");
  if (validateReceipt(item)) throw new Error(validateReceipt(item)!);
  return item;
}
function importedSettings(
  value: any,
  fallback: AppState,
  mobile: boolean,
): SettingsDraft {
  if (!plain(value)) throw new Error("Invalid settings.");
  const defaults = preferenceDefaults();
  let draft: SettingsDraft;
  if (mobile)
    draft = {
      preferences: {
        ...defaults,
        ...pick(value.preferences ?? {}, Object.keys(defaults)),
        defaultReminders: {
          ...defaults.defaultReminders,
          ...pick(
            value.preferences?.defaultReminders ?? {},
            Object.keys(defaults.defaultReminders),
          ),
        },
      },
      plan: {
        ...fallback.defaultPlan,
        ...pick(value.plan ?? {}, Object.keys(fallback.defaultPlan)),
      },
      breakIncluded: Boolean(value.breakIncluded),
    };
  else
    draft = {
      preferences: {
        ...defaults,
        ...pick(value, [
          "enableManualEditing",
          "allowConcurrentShifts",
          "showDailyQuote",
          "clockFormat",
          "typicalStartTime",
          "payHiddenByDefault",
          "currency",
        ]),
        headerTimerMode:
          value.tabTitleEnabled === false
            ? "off"
            : (value.tabTitleMode ?? "count-up"),
        defaultReminders: {
          ...defaults.defaultReminders,
          lunchMode: value.enableLunchReminder === false ? "off" : "relative",
          lunchHours: value.hoursBeforeLunchReminder ?? 5,
          returnReminder: value.enableReturnReminder ?? true,
          repeatMinutes: value.repeatReminderMinutes ?? 10,
          snoozeMinutes: value.reminderSnoozeMinutes ?? 10,
          sound: value.reminderSound ?? true,
          indicator: value.reminderTabFlash ?? true,
          overlay: value.reminderOverlay ?? true,
          custom: value.customReminders ?? [],
        },
      },
      plan: {
        ...fallback.defaultPlan,
        plannedHours: value.typicalHours ?? 8,
        lunchEnabled: value.typicalLunchEnabled ?? true,
        lunchMinutes: value.defaultLunchDuration ?? 30,
        hourlyRate: value.hourlyRate ?? fallback.hourlyRate,
        overtimeThreshold: value.overtimeThreshold ?? 8,
        overtimeMultiplier: value.overtimeMultiplier ?? 1.5,
        timerDirection: value.shiftTimerDirection ?? "count-up",
      },
      breakIncluded: Boolean(value.breakIncludedInRemaining),
    };
  const error = validateSettings(draft);
  if (error) throw new Error(error);
  return draft;
}

export function parseBackup(
  text: string,
  filename: string,
  fallback: AppState,
): ImportData {
  if (text.length > MAX_SIZE)
    throw new Error("Backup exceeds the 10 MB limit.");
  if (filename.toLowerCase().endsWith(".csv")) return parseCSV(text);
  if (!filename.toLowerCase().endsWith(".json"))
    throw new Error("Choose a .json or .csv file.");
  let parsed: any;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Invalid JSON file.");
  }
  if (Array.isArray(parsed))
    return {
      format: "web",
      history: entries(parsed, importedShift),
      warnings: [
        "History-only backup; profiles and receipts are not included.",
      ],
    };
  if (!plain(parsed) || !Array.isArray(parsed.history))
    throw new Error("Unrecognized backup format.");
  const mobile = parsed.format === "clocked-and-paid-mobile";
  if (mobile && parsed.version !== 1)
    throw new Error("Unsupported mobile backup version.");
  const result: ImportData = {
    format: mobile ? "mobile" : "web",
    history: entries(parsed.history, importedShift),
    warnings: mobile
      ? []
      : [
          "Client web backups do not contain job profiles or received paychecks. Unknown jobs will use the imported global rate.",
        ],
  };
  if (parsed.jobs !== undefined)
    result.jobs = entries(parsed.jobs, importedJob);
  if (parsed.deductions !== undefined)
    result.deductions = entries(parsed.deductions, importedDeduction);
  if (parsed.paychecks !== undefined)
    result.paychecks = entries(parsed.paychecks, importedReceipt);
  if (parsed.paySchedules !== undefined) {
    if (!plain(parsed.paySchedules))
      throw new Error("Invalid saved pay schedules.");
    result.paySchedules = Object.fromEntries(
      Object.entries(parsed.paySchedules).map(([key, value]) => {
        if (!id(key) || !plain(value))
          throw new Error("Invalid pay schedule scope.");
        const schedule = pick(
          value,
          "frequency periodStart periodEnd payDate payDelayDays anchorDate customPeriod".split(
            " ",
          ),
        ) as PaySchedule;
        if (
          !["weekly", "biweekly", "semi-monthly", "monthly"].includes(
            schedule.frequency,
          ) ||
          !amount(schedule.payDelayDays) ||
          validateSchedule(schedule)
        )
          throw new Error("Invalid pay schedule dates or delay.");
        return [key, schedule];
      }),
    );
  }
  if (parsed.settings !== undefined)
    result.settings = importedSettings(parsed.settings, fallback, mobile);
  return result;
}

export function backupText(data: AppState) {
  const drafts = [
    data.activeShift,
    ...data.extraShifts,
    data.orphanedShift,
  ].filter((item): item is Shift => Boolean(item));
  const byId = new Map(
    [...data.history, ...drafts].map((item) => [item.id, item]),
  );
  return JSON.stringify(
    {
      format: "clocked-and-paid-mobile",
      version: 1,
      exportedAt: new Date().toISOString(),
      history: [...byId.values()],
      jobs: data.jobs,
      deductions: data.deductions,
      paychecks: data.paychecks,
      paySchedules: data.paySchedules,
      settings: {
        preferences: data.preferences,
        plan: data.defaultPlan,
        breakIncluded: data.breakIncludedInRemaining,
      },
    },
    null,
    2,
  );
}
export function csvText(data: AppState) {
  // JSON is the lossless backup. CSV is a spreadsheet/history interchange format.
  return csvFor(
    data.history,
    data.jobs,
    data.defaultPlan,
    data.preferences.currency,
    data.paychecks,
  );
}
export function applyImport(
  data: AppState,
  imported: ImportData,
  mode: "merge" | "replace",
  includeSettings: boolean,
): AppState {
  if (mode === "replace" && workInProgress(data))
    throw new Error(
      "Clock out or resolve all running/recoverable shifts before replacing data.",
    );
  const incoming = preserveWorkspacePricing({
    ...data,
    history: imported.history,
    jobs: imported.jobs ?? data.jobs,
    defaultPlan: imported.settings?.plan ?? data.defaultPlan,
    preferences: imported.settings?.preferences ?? data.preferences,
    activeShift: null,
    extraShifts: [],
    orphanedShift: null,
    deductions: imported.deductions ?? [],
    paychecks: imported.paychecks ?? [],
  });
  imported = {
    ...imported,
    history: incoming.history,
    jobs: imported.jobs ? incoming.jobs : undefined,
    deductions: imported.deductions ? incoming.deductions : undefined,
    paychecks: imported.paychecks ? incoming.paychecks : undefined,
  };
  if (includeSettings && imported.settings) {
    const next = imported.settings;
    if (
      data.preferences.currency !== next.preferences.currency ||
      data.defaultPlan.hourlyRate !== next.plan.hourlyRate ||
      data.defaultPlan.overtimeThreshold !== next.plan.overtimeThreshold ||
      data.defaultPlan.overtimeMultiplier !== next.plan.overtimeMultiplier
    )
      data = preserveWorkspacePricing(data);
  }
  const combine = <T extends { id: string }>(
    current: T[],
    incoming: T[] | undefined,
  ) =>
    incoming === undefined
      ? current
      : mode === "replace"
        ? incoming
        : [
            ...new Map(
              [...incoming, ...current].map((item) => [item.id, item]),
            ).values(),
          ];
  const protectedIds = new Set([
    data.activeShift?.id,
    data.orphanedShift?.id,
    ...data.extraShifts.map((item) => item.id),
  ]);
  const history = [
    ...combine(
      data.history,
      imported.history.filter((item) => !protectedIds.has(item.id)),
    ),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const result = {
    ...data,
    history,
    jobs: combine(data.jobs, imported.jobs),
    deductions: combine(data.deductions, imported.deductions),
    paychecks: combine(data.paychecks, imported.paychecks),
    paySchedules: imported.paySchedules
      ? mode === "replace"
        ? imported.paySchedules
        : { ...imported.paySchedules, ...data.paySchedules }
      : data.paySchedules,
  };
  if (includeSettings && imported.settings) {
    result.preferences = imported.settings.preferences;
    result.defaultPlan = imported.settings.plan;
    result.breakIncludedInRemaining = imported.settings.breakIncluded;
    result.hourlyRate = result.defaultPlan.hourlyRate;
    result.payVisible = !result.preferences.payHiddenByDefault;
  }
  const selected =
    result.jobs.find(
      (item) => !item.archived && item.id === data.selectedJobId,
    ) ??
    result.jobs.find((item) => !item.archived && item.isDefault) ??
    result.jobs.find((item) => !item.archived);
  result.selectedJobId = selected?.id ?? "";
  const defaultJob =
    (mode === "merge"
      ? data.jobs.find((item) => item.isDefault && !item.archived)
      : null) ??
    result.jobs.find((item) => item.isDefault && !item.archived) ??
    selected;
  result.jobs = result.jobs.map((job) => ({
    ...job,
    isDefault: job.id === defaultJob?.id,
  }));
  const byJob = new Map<string, MockPaycheck[]>();
  for (const receipt of result.paychecks) {
    if (!receipt.paid) continue;
    const currency =
      receipt.currency ??
      result.jobs.find((job) => job.id === receipt.jobId)?.currency ??
      result.preferences.currency;
    const key = `${receipt.jobId}|${currency}`;
    const group = byJob.get(key);
    if (group) group.push(receipt);
    else byJob.set(key, [receipt]);
  }
  for (const receipts of byJob.values()) {
    receipts.sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let index = 1; index < receipts.length; index++)
      if (receipts[index]!.startDate <= receipts[index - 1]!.endDate)
        throw new Error(
          "Overlapping received paychecks would duplicate payments. Resolve the conflict before importing.",
        );
  }
  if (
    !workInProgress(data) &&
    (result.selectedJobId !== data.selectedJobId ||
      (includeSettings && imported.settings))
  )
    result.todayPlan = {
      ...result.defaultPlan,
      hourlyRate: selected?.hourlyRate ?? result.defaultPlan.hourlyRate,
      overtimeThreshold:
        selected?.overtimeThreshold ?? result.defaultPlan.overtimeThreshold,
      overtimeMultiplier:
        selected?.overtimeMultiplier ?? result.defaultPlan.overtimeMultiplier,
      lunchEnabled: selected?.lunchEnabled ?? result.defaultPlan.lunchEnabled,
      lunchMinutes: selected?.lunchMinutes ?? result.defaultPlan.lunchMinutes,
    };
  if (includeSettings && imported.settings) {
    const settings =
      result.jobs.find(
        (job) => job.id === (data.activeShift?.jobId ?? result.selectedJobId),
      )?.reminderSettings ?? result.preferences.defaultReminders;
    result.reminders = {
      ...result.reminders,
      lunchReminder: settings.lunchMode !== "off",
      returnReminder: settings.returnReminder,
      reminderSound: settings.sound,
      reminderOverlay: settings.overlay,
      reminderTabFlash: settings.indicator,
      reminderSnoozeMinutes: settings.snoozeMinutes,
    };
  }
  return result;
}

// RFC-style CSV tokenization supports escaped quotes, commas and multiline notes.
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) quoted = !quoted;
      else throw new Error("Malformed CSV quotes.");
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((item) => item.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  row.push(cell);
  if (row.some((item) => item.trim())) rows.push(row);
  return rows;
}
function parseCSV(text: string): ImportData {
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  if (rows.length > 50001)
    throw new Error("CSV exceeds the 50,000-entry limit.");
  if (rows.length < 2) throw new Error("CSV has no time entries.");
  const headers = rows[0]!.map((item) =>
    item.trim().toLowerCase().replaceAll("_", " "),
  );
  if (!headers.includes("date")) throw new Error('CSV needs a "Date" column.');
  const occurrences = new Map<string, number>();
  const history = rows.slice(1).map((row) => {
    const get = (...keys: string[]) => {
      const i = headers.findIndex((item) => keys.includes(item));
      return i >= 0 ? row[i] || null : null;
    };
    const date = get("date");
    const signature = JSON.stringify(
      headers
        .map((header, i) => [header, row[i] ?? ""])
        .sort(([a], [b]) => a!.localeCompare(b!)),
    );
    let hash = 2166136261;
    for (const char of signature)
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const number = (occurrences.get(signature) ?? 0) + 1;
    occurrences.set(signature, number);
    const recordId =
      get("id") ?? `csv-${date}-${(hash >>> 0).toString(16)}-${number}`;
    const start = get("clock in", "clockin"),
      end = get("clock out", "clockout");
    if (start?.includes("T") || end?.includes("T")) {
      const project = get("type") === "project";
      const wages = Number(get("wages") ?? 0);
      const elapsed =
        start && end ? (Date.parse(end) - Date.parse(start)) / 60000 : 0;
      const worked = Number(get("worked minutes") ?? elapsed);
      return importedShift({
        id: recordId,
        date,
        startedAt: start ?? `${date}T00:00:00`,
        endedAt: end,
        missingClockIn: !start,
        earnings: wages,
        lunchMinutes:
          get("lunch minutes") != null
            ? Number(get("lunch minutes"))
            : Math.max(0, elapsed - worked),
        breakMinutes: Number(get("break minutes") ?? 0),
        customRate:
          get("custom rate") != null ? Number(get("custom rate")) : null,
        jobId: get("job id"),
        tipType: get("tip type"),
        tips: Number(get("tips") ?? 0),
        paid: get("paid") === "yes",
        entryType: project ? "project" : "shift",
        flatAmount: project ? wages : null,
        projectName: get("project"),
        projectNotes: get("notes"),
        currency: get("currency"),
        endDate: get("end date"),
      });
    }
    return importedShift({
      id: recordId,
      date,
      clockIn: start,
      clockOut: end,
      jobId: get("job id"),
      tips: Number(get("tips") ?? 0),
      tipType: get("tip type"),
      customRate:
        get("custom rate") != null ? Number(get("custom rate")) : null,
      isPaid: get("paid") === "yes" || get("paid") === "true",
      lunchStart: get("lunch start"),
      lunchEnd: get("lunch end"),
      entryType: get("type") ?? "shift",
      flatAmount: get("type") === "project" ? Number(get("wages") ?? 0) : null,
      projectName: get("project"),
      projectNotes: get("notes"),
      currency: get("currency"),
      endDate: get("end date"),
    });
  });
  if (new Set(history.map((item) => item.id)).size !== history.length)
    throw new Error("Duplicate record IDs in CSV.");
  return {
    format: "csv",
    history,
    warnings: [
      "CSV contains history only, without job profiles, settings or receipts. Use JSON for lossless backup.",
    ],
  };
}
