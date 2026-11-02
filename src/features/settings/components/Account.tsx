"use client";
import { User, Mail, Lock, Save, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Field, Panel } from "@/components/Fields";
import { Confirm } from "@/features/pay/components/Shared";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import { rebaseAccountDraft } from "../model";
import { useSettingsActions } from "../useSettingsActions";

export function Account({ unsaved }: { unsaved: boolean }) {
  const data = useApp(),
    { busy: saving } = useWorkspace(),
    actions = useSettingsActions();
  const [draft, setDraft] = useState(data.account),
    previous = useRef(data.account);
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [message, setMessage] = useState<Record<string, string>>({}),
    [operation, setOperation] = useState(""),
    pending = useRef(false);
  const [signOut, setSignOut] = useState(false);
  useEffect(() => {
    const old = previous.current;
    previous.current = data.account;
    setDraft((value) => rebaseAccountDraft(value, old, data.account));
  }, [data.account]);
  const run = async (
    key: string,
    task: () => Promise<string | null>,
    success: string,
  ) => {
    if (pending.current) return;
    pending.current = true;
    setOperation(key);
    setMessage((values) => ({ ...values, [key]: "" }));
    try {
      const error = await task();
      setMessage((values) => ({ ...values, [key]: error ?? success }));
      if (!error && key === "password") {
        setPassword("");
        setConfirmation("");
      }
    } catch {
      setMessage((values) => ({
        ...values,
        [key]: "Could not save. Your inputs are kept.",
      }));
    } finally {
      pending.current = false;
      setOperation("");
    }
  };
  const busy = saving || Boolean(operation);
  return (
    <Panel
      title="Account"
      icon={<User size={16} />}
      subtitle="Profile changes are saved in this browser for the demo."
    >
      {data.account.mode === "guest" ? (
        <div className="settings-guest">
          <h3>You're using guest mode</h3>
          <p>
            Your work is saved in this browser. Enter mock account data to
            preview profile controls.
          </p>
          <Link className="button-link primary" href="/auth">
            Sign in with mock data
          </Link>
        </div>
      ) : (
        <>
          <fieldset
            disabled={busy}
            className="form-stack settings-account-form"
          >
            <div className="settings-account-section">
              <h3>
                <User size={14} aria-hidden="true" />
                Name
              </h3>
              <Field
                label="Display name"
                value={draft.name}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, name: event.target.value }))
                }
              />
              <button
                className="primary"
                disabled={draft.name === data.account.name}
                onClick={() =>
                  void run(
                    "name",
                    () => actions.account({ name: draft.name }),
                    "Display name updated locally.",
                  )
                }
              >
                <Save size={14} aria-hidden="true" />
                {operation === "name" ? "Saving…" : "Update name"}
              </button>
              {message.name && <p role="status">{message.name}</p>}
            </div>
            <div className="settings-account-section">
              <h3>
                <Mail size={14} aria-hidden="true" />
                Email address
              </h3>
              <p className="settings-current-email">
                <Mail size={14} aria-hidden="true" />
                Current: <strong>{data.account.email}</strong>
              </p>
              <Field
                label="Email address"
                type="email"
                value={draft.email}
                onChange={(event) =>
                  setDraft((value) => ({ ...value, email: event.target.value }))
                }
              />
              <p>
                Enter a different email to enable Update email. No verification
                email is sent.
              </p>
              <button
                disabled={draft.email === data.account.email}
                onClick={() =>
                  void run(
                    "email",
                    () => actions.account({ email: draft.email }),
                    "Email updated locally; no verification email was sent.",
                  )
                }
              >
                <Mail size={14} aria-hidden="true" />
                {operation === "email" ? "Saving…" : "Update email"}
              </button>
              {message.email && <p role="status">{message.email}</p>}
            </div>
            <div className="settings-account-section">
              <h3>
                <Lock size={14} aria-hidden="true" />
                Update password
              </h3>
              <Field
                label="New mock password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <Field
                label="Confirm mock password"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
              <p>
                Use at least six characters and a matching confirmation. This
                saves a local digest; mock sign-in continues to accept any
                non-empty credentials.
              </p>
              <button
                onClick={() =>
                  void run(
                    "password",
                    () => actions.password(password, confirmation),
                    "Local mock password digest updated.",
                  )
                }
              >
                <Lock size={14} aria-hidden="true" />
                {operation === "password" ? "Saving…" : "Update password"}
              </button>
              {message.password && <p role="status">{message.password}</p>}
            </div>
          </fieldset>
          <button disabled={busy} onClick={() => setSignOut(true)}>
            <LogOut size={14} aria-hidden="true" />
            Sign out of mock account
          </button>
        </>
      )}
      {signOut && (
        <Confirm
          title="Sign out?"
          label="Sign out"
          action={actions.signOut}
          onClose={() => setSignOut(false)}
        >
          <p>
            This returns to sign-in and retains work, settings and the privacy
            lock. Unsaved page inputs will be discarded.{" "}
            {unsaved ||
            draft.name !== data.account.name ||
            draft.email !== data.account.email ||
            password
              ? "There are unsaved inputs on this page."
              : ""}
          </p>
        </Confirm>
      )}
    </Panel>
  );
}
