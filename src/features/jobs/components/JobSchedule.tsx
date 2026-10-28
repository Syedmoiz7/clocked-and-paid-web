"use client";
import { Field } from "@/components/Fields";
import type { MockJob } from "@/types";
import { localDate } from "@/utils/dateOnly";
import { addDays } from "@/features/history/payPeriods";
import { frequencies } from "@/features/pay/model";
import { schedulePreview } from "../model";

export function JobSchedule({
  draft,
  delay,
  update,
  onDelay,
}: {
  draft: MockJob;
  delay: string;
  update: (value: Partial<MockJob>) => void;
  onDelay: (value: string) => void;
}) {
  const preview = schedulePreview(draft, localDate());
  const validDelay =
    delay.trim() &&
    Number.isInteger(Number(delay)) &&
    Number(delay) >= 0 &&
    Number(delay) <= 366;
  return (
    <div className="job-form-section">
      <h3>Pay schedule</h3>
      <label className="field">
        <span>Pay frequency</span>
        <select
          value={draft.payFrequency ?? "none"}
          onChange={(event) =>
            update({
              payFrequency:
                event.target.value === "none"
                  ? undefined
                  : (event.target.value as MockJob["payFrequency"]),
            })
          }
        >
          <option value="none">Not set</option>
          {frequencies.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {draft.payFrequency && (
        <>
          <Field
            label="Anchor period start"
            type="date"
            value={draft.payPeriodStart ?? ""}
            onChange={(event) => update({ payPeriodStart: event.target.value })}
          />
          <p>
            Period end (auto):{" "}
            {schedulePreview(draft, draft.payPeriodStart ?? "").find(
              (period) => period.label === "Current",
            )?.end ?? "Choose an anchor date"}
          </p>
          <p>
            The anchor permanently determines past and future period boundaries.
          </p>
          <Field
            label="Pay delay after period end (days)"
            type="number"
            value={delay}
            onChange={(event) => onDelay(event.target.value)}
          />
          <div className="job-periods">
            {preview.map((period) => (
              <div key={period.label}>
                <strong>{period.label}</strong>
                <span>
                  {period.start} → {period.end}
                </span>
                {validDelay && (
                  <small>
                    Expected pay {addDays(period.end, Number(delay))}
                  </small>
                )}
              </div>
            ))}
          </div>
          <p>
            Expected dates come from the period end and this delay. Enter actual
            received dates in Pay.
          </p>
        </>
      )}
    </div>
  );
}
