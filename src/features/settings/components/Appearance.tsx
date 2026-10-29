"use client";
import { Panel } from "@/components/Fields";
import type { AppState } from "@/types";
import { themeOptions, type SettingsDraft } from "../model";
import { money } from "@/features/history/model";

export function Appearance({
  data,
  busy,
  onHue,
}: {
  data: AppState;
  busy: boolean;
  onHue: (hue: number) => void;
}) {
  return (
    <Panel
      title="App Theme Color"
      subtitle="Saved immediately, independently of other preferences. Full palette uses Premium."
    >
      <div className="settings-colors" role="group" aria-label="App theme">
        {themeOptions.map((option) => (
          <button
            key={option.hue}
            aria-label={`${option.label}${option.hue !== 338 && !data.isPremium ? ", Premium" : ""}`}
            aria-pressed={option.hue === data.preferences.themeHue}
            disabled={busy}
            style={{ background: `hsl(${option.hue} 62% 55%)` }}
            onClick={() => onHue(option.hue)}
          >
            {option.hue === data.preferences.themeHue ? "✓" : ""}
          </button>
        ))}
      </div>
    </Panel>
  );
}
export function PayPreview({
  data,
  draft,
}: {
  data: AppState;
  draft: SettingsDraft;
}) {
  const hours = draft.plan.plannedHours,
    valid = Number.isFinite(hours) && hours > 0 && hours <= 24;
  const rows = [
    ...data.jobs
      .filter((job) => !job.archived)
      .map((job) => ({
        id: job.id,
        name: job.name,
        rate: job.hourlyRate,
        threshold: job.overtimeThreshold ?? draft.plan.overtimeThreshold,
        multiplier: job.overtimeMultiplier ?? draft.plan.overtimeMultiplier,
        currency: job.currency ?? draft.preferences.currency,
      })),
    {
      id: "__global__",
      name: "Global / Unlabeled shifts",
      rate: draft.plan.hourlyRate,
      threshold: draft.plan.overtimeThreshold,
      multiplier: draft.plan.overtimeMultiplier,
      currency: draft.preferences.currency,
    },
  ];
  return (
    <Panel
      title="Pay Preview"
      subtitle="Gross for the draft’s paid work hours, including overtime. Lunch extends the day and is not subtracted again. Tips and deductions excluded."
    >
      {!valid ? (
        <p>Enter valid work hours to preview pay.</p>
      ) : (
        <div className="settings-pay-preview">
          {rows.map((row) => (
            <div key={row.id}>
              <h3>{row.name}</h3>
              <p>
                {data.payVisible
                  ? `Regular / hr: ${money(row.rate, row.currency)} · OT / hr: ${money(row.rate * row.multiplier, row.currency)} · ${hours}hr gross: ${money(Math.min(hours, row.threshold) * row.rate + Math.max(0, hours - row.threshold) * row.rate * row.multiplier, row.currency)}`
                  : "••••• · pay is hidden"}
              </p>
            </div>
          ))}
        </div>
      )}
      <p>Edit hourly rates and overtime overrides in Jobs.</p>
    </Panel>
  );
}
