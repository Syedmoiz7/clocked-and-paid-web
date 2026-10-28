export type TrackerSectionId =
  "completed" | "manual" | "plan" | "reminders" | "calculator";

export function trackerSections(
  manualEditing: boolean,
  completedCount: number,
) {
  return [
    { id: "completed" as const, label: `Completed Today (${completedCount})` },
    ...(manualEditing
      ? [{ id: "manual" as const, label: "Manual Times" }]
      : []),
    { id: "plan" as const, label: "Today's Plan" },
    { id: "reminders" as const, label: "Reminders" },
    { id: "calculator" as const, label: "Hours Calculator" },
  ];
}

export function visibleTrackerSection(
  selected: TrackerSectionId,
  manualEditing: boolean,
) {
  return selected === "manual" && !manualEditing ? "plan" : selected;
}
