"use client";
import { useRef, useState } from "react";
import { Field, Panel } from "@/components/Fields";
import type { LockType } from "../privacyLogic";
import { usePrivacy } from "./PrivacyProvider";

export function PrivacyCard() {
  const lock = usePrivacy(),
    [type, setType] = useState<LockType>("pin4"),
    [old, setOld] = useState(""),
    [value, setValue] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    pending = useRef(false);
  const run = async (task: () => Promise<void>, success: string) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await task();
      setOld("");
      setValue("");
      setConfirmation("");
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update privacy settings.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Panel
      title="Privacy lock"
      subtitle="Locks on reload and when the page is hidden. This local access gate does not encrypt browser data or exported files."
    >
      <p>
        {lock.configured ? `Enabled · ${lock.type}` : "Not configured"}. Keep
        your credential safe: mock sign-in cannot bypass it. Browser storage
        contains a salted password digest; it is not native secure storage.
        Device biometrics are unavailable in this web preview.
      </p>
      <fieldset disabled={busy} className="form-stack">
        {lock.configured && (
          <Field
            label="Current PIN / password"
            type="password"
            autoComplete="off"
            value={old}
            onChange={(event) => setOld(event.target.value)}
          />
        )}
        <label className="field">
          <span>Lock type</span>
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value as LockType);
              setValue("");
              setConfirmation("");
              setMessage("");
            }}
          >
            <option value="pin4">4-digit PIN</option>
            <option value="pin6">6-digit PIN</option>
            <option value="password">Password</option>
          </select>
        </label>
        <Field
          label="New PIN / password"
          type="password"
          autoComplete="new-password"
          inputMode={type === "password" ? "text" : "numeric"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Field
          label="Confirm new credential"
          type="password"
          autoComplete="new-password"
          inputMode={type === "password" ? "text" : "numeric"}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <button
          onClick={() =>
            value !== confirmation
              ? setMessage("Credentials don't match.")
              : void run(
                  () => lock.setup(type, value, old),
                  "Local privacy lock saved.",
                )
          }
        >
          {busy
            ? "Saving…"
            : lock.configured
              ? "Change privacy lock"
              : "Enable privacy lock"}
        </button>
        {lock.configured && (
          <>
            <button onClick={lock.lock}>Lock now</button>
            <button
              onClick={() =>
                void run(() => lock.remove(old), "Privacy lock removed.")
              }
            >
              Remove privacy lock
            </button>
          </>
        )}
      </fieldset>
      {message && <p role="status">{message}</p>}
    </Panel>
  );
}
