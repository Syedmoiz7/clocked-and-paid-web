"use client";
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
export function PlanCards({
  value,
  onChange,
  disabled = false,
}: {
  value: PlanChoice;
  onChange: (value: PlanChoice) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="signup-plans" disabled={disabled}>
      <legend>Choose your plan</legend>
      <div>
        {planOptions.map((plan) => (
          <label
            className={value === plan.value ? "selected" : ""}
            key={plan.value}
          >
            <span>
              <input
                type="radio"
                aria-label={plan.name}
                name="signup-plan"
                value={plan.value}
                checked={value === plan.value}
                onChange={() => onChange(plan.value)}
              />
              <strong>{plan.name}</strong>
            </span>
            <small>{plan.description}</small>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </label>
        ))}
      </div>
      <p>
        Neither tier loads real ads in this demo. Your choice applies after mock
        confirmation. Premium is a no-charge local preview.
      </p>
    </fieldset>
  );
}
