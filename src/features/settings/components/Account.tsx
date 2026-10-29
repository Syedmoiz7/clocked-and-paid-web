"use client";
import { User } from "lucide-react";
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
      subtitle="Local demo account. Guest and mock-account modes share this browser workspace; no server account or email delivery is created."
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
          <p>Mock account · {data.account.email}</p>
          <fieldset disabled={busy} className="form-stack">
            <Field
              label="Display name"
              value={draft.name}
              onChange={(event) =>
                setDraft((value) => ({ ...value, name: event.target.value }))
              }
            />
            <button
              disabled={draft.name === data.account.name}
              onClick={() =>
                void run(
                  "name",
                  () => actions.account({ name: draft.name }),
                  "Display name updated locally.",
                )
              }
            >
              {operation === "name" ? "Saving…" : "Update name"}
            </button>
            {message.name && <p role="status">{message.name}</p>}
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
              {operation === "email" ? "Saving…" : "Update email"}
            </button>
            {message.email && <p role="status">{message.email}</p>}
            <div className="job-form-section">
              <h3>Update password</h3>
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
                {operation === "password" ? "Saving…" : "Update password"}
              </button>
              {message.password && <p role="status">{message.password}</p>}
            </div>
          </fieldset>
          <button disabled={busy} onClick={() => setSignOut(true)}>
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
