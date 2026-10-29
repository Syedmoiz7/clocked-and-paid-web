"use client";
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { X } from "lucide-react";
export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} {...props} />
    </label>
  );
}
export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
export function Panel({
  title,
  subtitle,
  children,
  icon,
  iconTone = "brand",
  variant = "default",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  icon?: ReactNode;
  iconTone?: "brand" | "cyan" | "blue" | "danger";
  variant?: "default" | "danger";
}) {
  return (
    <section
      className={`card panel${variant === "danger" ? " panel-danger" : ""}`}
    >
      <header>
        {icon && (
          <span
            className={`panel-icon panel-icon-${iconTone}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </header>
      <div className="panel-content">{children}</div>
    </section>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    heading = useId();
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const show = () => {
      if (
        !document.documentElement.dataset.workspaceLocked &&
        node &&
        !node.open
      )
        node.showModal();
    };
    show();
    window.addEventListener("workspace-unlocked", show);
    return () => {
      window.removeEventListener("workspace-unlocked", show);
      node?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const node = event.currentTarget;
        const controls = [
          ...node.querySelectorAll<HTMLElement>(
            'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ].filter(
          (control) =>
            control.tabIndex >= 0 &&
            control.getClientRects().length &&
            !control.closest("[hidden], [inert]"),
        );
        const first = controls[0],
          last = controls.at(-1);
        if (!first || !last) {
          event.preventDefault();
          node.focus();
          return;
        }
        const index = controls.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey
          ? index <= 0
            ? controls.length - 1
            : index - 1
          : (index + 1) % controls.length;
        event.preventDefault();
        controls[next].focus();
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2 id={heading}>{title}</h2>
        <button disabled={busy} onClick={onClose} aria-label="Close dialog">
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="dialog-content">{children}</div>
    </dialog>
  );
}
