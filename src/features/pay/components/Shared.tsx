"use client";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/Fields";
import { ChevronDown } from "lucide-react";

export function PaySection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <details className="card pay-section" open>
      <summary>
        <span>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
        <span className="section-chevron" aria-hidden>
          <ChevronDown size={16} />
        </span>
      </summary>
      <div className="panel-content">{children}</div>
    </details>
  );
}
export function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`pay-metric${accent ? " positive" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
export function Paywall({ title }: { title: string }) {
  return (
    <div className="pay-lock">
      <h3>{title}</h3>
      <p>Preview Premium to explore this feature with your saved work.</p>
      <Link className="button-link primary" href="/plans?returnTo=pay">
        See plans
      </Link>
    </div>
  );
}
export function usePayForm(
  onSave: () => Promise<string | null>,
  onClose: () => void,
) {
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      const error = await onSave();
      if (error) setError(error);
      else onClose();
    } catch {
      setError("Could not save. Your inputs are still here; try again.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return { submit, error, saving };
}
export function FormFooter({
  error,
  saving,
  label,
  onClose,
}: {
  error: string | null;
  saving: boolean;
  label: string;
  onClose: () => void;
}) {
  return (
    <>
      <p role={error ? "alert" : undefined} className="error">
        {error}
      </p>
      <footer className="form-actions">
        <button type="button" disabled={saving} onClick={onClose}>
          Cancel
        </button>
        <button className="primary" disabled={saving} type="submit">
          {saving ? "Saving…" : label}
        </button>
      </footer>
    </>
  );
}
export function Confirm({
  title,
  children,
  action,
  label,
  onClose,
}: {
  title: string;
  children: ReactNode;
  action: () => Promise<string | null>;
  label: string;
  onClose: () => void;
}) {
  const form = usePayForm(action, onClose);
  return (
    <Modal title={title} onClose={onClose} busy={form.saving}>
      <form onSubmit={form.submit}>
        <fieldset disabled={form.saving}>{children}</fieldset>
        <FormFooter {...form} label={label} onClose={onClose} />
      </form>
    </Modal>
  );
}
