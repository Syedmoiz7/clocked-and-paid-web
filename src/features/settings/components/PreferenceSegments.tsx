"use client";

export function PreferenceSegments<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; description: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-choice">
      <h3>{label}</h3>
      <div className="settings-segments" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span> <small>{option.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
