export type PlanChoice = "free" | "premium";
export const planOptions = [
  {
    value: "free" as const,
    name: "Free",
    description: "Ad-supported",
    features: [
      "Basic tracking and reminders",
      "One job profile",
      "Current-month History",
      "Current-period Pay",
    ],
  },
  {
    value: "premium" as const,
    name: "Premium",
    description: "Ads removed",
    features: [
      "Multiple jobs and Hours Calculator",
      "Full History, Calendar and export",
      "Advanced Pay and deductions",
      "Backup, recovery and full palette",
    ],
  },
];
