"use client";
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Eye, EyeOff, Mail, LockKeyhole, UserRound } from "lucide-react";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import Link from "next/link";

export function AuthLayout({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  const data = useApp();
  return (
    <main
      className={`workspace-theme auth-page${wide ? " auth-wide" : ""}`}
      style={{ "--brand-h": data.preferences.themeHue } as CSSProperties}
    >
      <div className="auth-brand">
        <span className="brand-mark">C&P</span>
        <h1>
          Clocked <em>&</em> Paid
        </h1>
        <p>Your private time & pay tracker</p>
      </div>
      <section className="card auth-card">{children}</section>
      <p className="auth-footnote">
        Local demo · no backend, email delivery or billing
      </p>
      <nav className="auth-info-links" aria-label="Information">
        <Link href="/">Home</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/contact">Contact</Link>
      </nav>
    </main>
  );
}
export function AuthField({
  label,
  value,
  onChange,
  password = false,
  email = false,
  name = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  password?: boolean;
  email?: boolean;
  name?: boolean;
  disabled?: boolean;
}) {
  const id = useId(),
    [show, setShow] = useState(false),
    Icon = password ? LockKeyhole : email ? Mail : UserRound;
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div>
        <Icon size={17} aria-hidden />
        <input
          id={id}
          type={password && !show ? "password" : "text"}
          inputMode={email ? "email" : "text"}
          autoComplete={
            password ? "off" : email ? "email" : name ? "name" : "off"
          }
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {password && (
          <button
            type="button"
            disabled={disabled}
            aria-label={`${show ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-pressed={show}
            onClick={() => setShow((value) => !value)}
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
    </div>
  );
}
export function useAuthTask() {
  const { busy: saving } = useWorkspace(),
    pending = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (task: () => Promise<void>) => {
    if (pending.current || saving) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save. Your inputs are kept.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { busy: busy || saving, error, setError, run };
}
export function AuthError({ message }: { message: string }) {
  return message ? (
    <p className="auth-message error" role="alert">
      {message}
    </p>
  ) : null;
}
