"use client";
import { Panel } from "@/components/Fields";
import type { AppState } from "@/types";
import { themeOptions, type SettingsDraft } from "../model";
import { money } from "@/features/history/model";
import { accentInk } from "@/lib/theme";

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
      icon={<span>🎨</span>}
      subtitle="Saved immediately, independently of other preferences. Full palette uses Premium."
    >
      <div className="settings-colors" role="group" aria-label="App theme">
        {themeOptions.map((option) => (
          <button
            key={option.hue}
            aria-label={`${option.label}${option.hue !== 338 && !data.isPremium ? ", Premium" : ""}`}
            aria-pressed={option.hue === data.preferences.themeHue}
            disabled={busy}
            style={{
              background: `hsl(${option.hue} 62% 55%)`,
              color: accentInk(option.hue, 55),
            }}
            onClick={() => onHue(option.hue)}
          >
            {option.hue === data.preferences.themeHue ? "✓" : ""}
          </button>
        ))}
      </div>
      <p className="settings-theme-caption">
        Current:{" "}
        <strong>
          {themeOptions.find(
            (option) => option.hue === data.preferences.themeHue,
          )?.label ?? "Custom"}
        </strong>{" "}
        · Saved automatically.
      </p>
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
            <div key={row.id} className="settings-preview-row">
              <h3>{row.name}</h3>
              <dl className="settings-preview-metrics">
                <div>
                  <dt>Regular / hr</dt>
                  <dd>
                    {data.payVisible ? money(row.rate, row.currency) : "•••••"}
                  </dd>
                </div>
                <div>
                  <dt>OT / hr</dt>
                  <dd>
                    {data.payVisible
                      ? money(row.rate * row.multiplier, row.currency)
                      : "•••••"}
                  </dd>
                </div>
                <div>
                  <dt>{hours}hr gross</dt>
                  <dd>
                    {data.payVisible
                      ? money(
                          Math.min(hours, row.threshold) * row.rate +
                            Math.max(0, hours - row.threshold) *
                              row.rate *
                              row.multiplier,
                          row.currency,
                        )
                      : "•••••"}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
      <p>Edit hourly rates and overtime overrides in Jobs.</p>
    </Panel>
  );
}
