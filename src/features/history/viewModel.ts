import type { AppState, Shift } from "../../types";
import { localDate, validDate, type HistoryFilters } from "./model";
import { addDays, payPeriod } from "./payPeriods";

export const periods = [
  { value: "all", label: "All time" }, { value: "week", label: "This week" },
  { value: "lastWeek", label: "Last week" }, { value: "month", label: "This month" },
  { value: "year", label: "This year" }, { value: "custom", label: "Custom" },
] as const;
export function selectedRange(filters: HistoryFilters, now = new Date()) {
  const date = localDate(now), year = now.getFullYear(), month = now.getMonth();
  switch (filters.period) {
    case "all": return null;
    case "custom": return validDate(filters.from) && validDate(filters.to) && filters.from <= filters.to ? { start: filters.from, end: filters.to } : null;
    case "month": return { start: localDate(new Date(year, month, 1, 12)), end: localDate(new Date(year, month + 1, 0, 12)) };
    case "year": return { start: `${year}-01-01`, end: `${year}-12-31` };
    default: {
      const start = addDays(date, -((now.getDay() + 6) % 7) - (filters.period === "lastWeek" ? 7 : 0));
      return { start, end: addDays(start, 6) };
    }
  }
}
export function rangeLabel(filters: HistoryFilters, now = new Date()) {
  const range = selectedRange(filters, now), label = periods.find((item) => item.value === filters.period)?.label;
  if (!range) return filters.period === "custom" ? "Select a valid custom date range" : "All saved dates";
  const format = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${label} · ${format(range.start)} – ${format(range.end)}`;
}
export const newestFirst = (entries: Shift[]) => [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
export function savedCalendarEntries(data: AppState, jobId: string) {
  const liveIds = new Set([data.activeShift, ...data.extraShifts].filter((item): item is Shift => Boolean(item)).map((item) => item.id));
  return newestFirst(data.history.filter((entry) => !liveIds.has(entry.id) && (!jobId || entry.jobId === jobId)));
}
export type CalendarMode = "daily" | "weekly" | "monthly" | "yearly" | "payperiods" | "summary";
export type CalendarGroup = { key: string; label: string; start: string; end: string; entries: Shift[] };
export function calendarGroups(mode: CalendarMode, year: number, month: number, day: string, entries: Shift[], data: AppState, jobId: string, from: string, to: string): CalendarGroup[] {
  const group = (key: string, label: string, start: string, end: string): CalendarGroup => ({ key, label, start, end, entries: entries.filter((entry) => entry.date >= start && entry.date <= end) });
  if (mode === "daily") return [group(day, day, day, day)];
  if (mode === "summary") return validDate(from) && validDate(to) && from <= to ? [group("summary", `${from} → ${to}`, from, to)] : [];
  if (mode === "monthly") return Array.from({ length: 12 }, (_, index) => group(`${year}-${index}`, new Date(year, index, 1).toLocaleDateString("en-US", { month: "long" }), localDate(new Date(year, index, 1, 12)), localDate(new Date(year, index + 1, 0, 12))));
  if (mode === "yearly") return [...new Set([year, ...entries.map((entry) => Number(entry.date.slice(0, 4)))])].sort((a, b) => b - a).map((value) => group(String(value), String(value), `${value}-01-01`, `${value}-12-31`));
  if (mode === "weekly") {
    const first = new Date(year, 0, 1, 12); first.setDate(first.getDate() - (first.getDay() + 6) % 7);
    return Array.from({ length: 54 }, (_, index) => addDays(localDate(first), index * 7)).filter((start) => start <= `${year}-12-31` && addDays(start, 6) >= `${year}-01-01`).map((start) => group(start, `${start} → ${addDays(start, 6)}`, start, addDays(start, 6)));
  }
  const job = data.jobs.find((item) => item.id === jobId);
  if (!job) return [];
  const result = new Map<string, { start: string; end: string }>();
  for (let dayOfMonth = 1; dayOfMonth <= new Date(year, month + 1, 0).getDate(); dayOfMonth++) {
    const period = payPeriod(localDate(new Date(year, month, dayOfMonth, 12)), job);
    if (period) result.set(period.start, period);
  }
  return [...result.values()].map((period) => group(period.start, `${period.start} → ${period.end}`, period.start, period.end));
}
