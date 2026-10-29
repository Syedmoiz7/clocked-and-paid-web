"use client";
import { Toggle } from "@/components/Fields";
import type { CustomReminder } from "@/types";
import { clockLabel } from "@/features/settings/model";

export function CustomReminders({
  value,
  onChange,
  onEdit,
  onDelete,
  clockFormat = "24h",
  target = "job",
}: {
  value: CustomReminder[];
  onChange: (value: CustomReminder[]) => void;
  onEdit: (value: CustomReminder) => void;
  onDelete: (value: CustomReminder) => void;
  clockFormat?: "12h" | "24h";
  target?: "job" | "defaults";
}) {
  return (
    <div className="job-form-section">
      <h3>Custom Reminders</h3>
      <p>
        {target === "job"
          ? "These changes stay in the draft until you save the job."
          : "These changes stay in the draft until you save App preferences."}
      </p>
      {!value.length && <p>No custom reminders yet.</p>}
      {value.map((item) => (
        <div className="job-reminder" key={item.id}>
          <Toggle
            label={item.name}
            checked={item.enabled}
            onChange={(enabled) =>
              onChange(
                value.map((reminder) =>
                  reminder.id === item.id ? { ...reminder, enabled } : reminder,
                ),
              )
            }
          />
          <p>
            {item.trigger === "at-time"
              ? `At ${clockLabel(item.atTime, clockFormat)}`
              : `${item.offsetMinutes}m after ${item.trigger === "after-clock-in" ? "clock-in" : "lunch starts"}`}
            {item.repeatMinutes > 0
              ? ` · repeats every ${item.repeatMinutes}m`
              : ""}{" "}
            · {item.priority} priority
          </p>
          {item.message && <p>{item.message}</p>}
          <div className="button-row">
            <button type="button" onClick={() => onEdit(item)}>
              Edit {item.name}
            </button>
            <button type="button" onClick={() => onDelete(item)}>
              Delete {item.name}
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onEdit({
            id: crypto.randomUUID(),
            name: "",
            message: "",
            enabled: true,
            trigger: "after-clock-in",
            offsetMinutes: 60,
            atTime: "12:00",
            repeatMinutes: 0,
            priority: "medium",
          })
        }
      >
        + Add reminder
      </button>
    </div>
  );
}
