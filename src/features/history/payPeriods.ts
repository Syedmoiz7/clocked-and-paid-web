import type { MockJob } from "../../types";
import { localDate, validDate } from "./model";
export function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00`);
  result.setDate(result.getDate() + days);
  return localDate(result);
}
export function payPeriod(date: string, job: MockJob) {
  if (
    !job.payFrequency ||
    !job.payPeriodStart ||
    !validDate(date) ||
    !validDate(job.payPeriodStart)
  )
    return null;
  const anchor = new Date(`${job.payPeriodStart}T12:00:00`);
  const current = new Date(`${date}T12:00:00`);
  if (job.payFrequency === "weekly" || job.payFrequency === "biweekly") {
    const dayNumber = (value: Date) =>
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) /
      86400000;
    const length = job.payFrequency === "weekly" ? 7 : 14;
    const offset =
      Math.floor((dayNumber(current) - dayNumber(anchor)) / length) * length;
    const start = addDays(job.payPeriodStart, offset);
    return { start, end: addDays(start, length - 1) };
  }
  const year = current.getFullYear();
  const month = current.getMonth();
  const day = anchor.getDate();
  const boundary = (offset: number, dayOfMonth: number) => {
    const last = new Date(year, month + offset + 1, 0).getDate();
    return localDate(
      new Date(year, month + offset, Math.min(dayOfMonth, last), 12),
    );
  };
  const candidates =
    job.payFrequency === "monthly"
      ? [-1, 0, 1, 2].map((offset) => boundary(offset, day))
      : [-1, 0, 1].flatMap((offset) => {
          const first = day <= 15 ? day : day - 15;
          return [boundary(offset, first), boundary(offset, first + 15)];
        });
  candidates.sort();
  const start = candidates.filter((value) => value <= date).at(-1);
  const end = candidates.find((value) => value > date);
  return start && end ? { start, end: addDays(end, -1) } : null;
}
