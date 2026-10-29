"use client";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Field } from "@/components/Fields";
import {
  configureLock,
  readLock,
  removeLock,
  unlockCredential,
  type BrowserLock,
} from "@/lib/browserCredentials";
import {
  PrivacyAttemptGate,
  privacyOperations,
  type LockType,
} from "../privacyLogic";

const Context = createContext<{
  configured: boolean;
  type: LockType | null;
  locked: boolean;
  lock: () => void;
  setup: (type: LockType, value: string, old: string) => Promise<void>;
  remove: (old: string) => Promise<void>;
} | null>(null);
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<BrowserLock | null>(null),
    [ready, setReady] = useState(false),
    [locked, setLocked] = useState(true),
    [error, setError] = useState(""),
    [credential, setCredential] = useState(""),
    [busy, setBusy] = useState(false);
  const gate = useRef(new PrivacyAttemptGate()),
    operation = useRef(privacyOperations()),
    current = useRef<BrowserLock | null>(null),
    channel = useRef<BroadcastChannel | null>(null),
    suspendedDialogs = useRef<HTMLDialogElement[]>([]);
  const update = (value: BrowserLock | null) => {
    current.current = value;
    setRecord(value);
  };
  const lock = () => {
    if (current.current) {
      gate.current.lock();
      document.documentElement.dataset.workspaceLocked = "true";
      setLocked(true);
      setCredential("");
    }
  };
  const refresh = async (force = true) => {
    const next = await readLock();
    update(next);
    if (force) {
      gate.current.lock();
      if (next) document.documentElement.dataset.workspaceLocked = "true";
      setLocked(Boolean(next));
    }
    setReady(true);
  };
  useEffect(() => {
    void refresh().catch(() =>
      setError(
        "Privacy configuration could not be loaded. Existing data has not been exposed. Retry browser storage.",
      ),
    );
    const background = () => {
      if (document.visibilityState === "hidden") lock();
    };
    const changed =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("clocked-paid-web-privacy")
        : null;
    channel.current = changed;
    const onChange = () => {
      void refresh().catch(() => {
        setLocked(true);
        setReady(false);
        setError("Privacy configuration could not be refreshed.");
      });
    };
    if (changed) changed.onmessage = onChange;
    const storage = (event: StorageEvent) => {
      if (event.key === "clocked-paid-privacy-revision") onChange();
    };
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", background);
    window.addEventListener("pagehide", lock);
    return () => {
      changed?.close();
      channel.current = null;
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", background);
      window.removeEventListener("pagehide", lock);
    };
  }, []);
  useLayoutEffect(() => {
    if (locked) {
      document.documentElement.dataset.workspaceLocked = "true";
      suspendedDialogs.current = [
        ...document.querySelectorAll<HTMLDialogElement>("dialog[open]"),
      ];
      suspendedDialogs.current.forEach((dialog) => dialog.close());
      document.title = "Workspace locked · Clocked & Paid";
    } else {
      delete document.documentElement.dataset.workspaceLocked;
      suspendedDialogs.current.forEach((dialog) => {
        if (dialog.isConnected && !dialog.open) dialog.showModal();
      });
      suspendedDialogs.current = [];
      window.dispatchEvent(new Event("workspace-unlocked"));
    }
  }, [locked]);
  const broadcast = () => {
    if (typeof BroadcastChannel !== "undefined") {
      channel.current?.postMessage("changed");
    } else {
      try {
        localStorage.setItem(
          "clocked-paid-privacy-revision",
          crypto.randomUUID(),
        );
      } catch {
        /* The current page remains protected. */
      }
    }
  };
  const setup = async (type: LockType, value: string, old: string) =>
    operation.current(async () => {
      update(await configureLock(type, value, old));
      broadcast();
    });
  const remove = async (old: string) =>
    operation.current(async () => {
      await removeLock(old);
      update(null);
      setLocked(false);
      broadcast();
    });
  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const token = gate.current.begin();
    setBusy(true);
    try {
      await operation.current(async () => {
        const next = await unlockCredential(credential);
        if (
          !gate.current.canUnlock(
            token,
            document.visibilityState === "visible" ? "active" : "background",
          )
        )
          throw new Error("The page was hidden. Unlock again to continue.");
        update(next);
        setLocked(false);
        setCredential("");
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not unlock. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  if (!ready)
    return (
      <main className="loading">
        <h1>Clocked & Paid</h1>
        <p role={error ? "alert" : undefined}>
          {error || "Checking privacy settings…"}
        </p>
        {error && (
          <button onClick={() => window.location.reload()}>Retry</button>
        )}
      </main>
    );
  return (
    <Context.Provider
      value={{
        configured: Boolean(record),
        type: record?.type ?? null,
        locked,
        lock: () => {
          lock();
          broadcast();
        },
        setup,
        remove,
      }}
    >
      <div hidden={locked} inert={locked}>
        {children}
      </div>
      {locked && (
        <main className="privacy-gate">
          <form
            className="card form-stack"
            onSubmit={(event) => void unlock(event)}
          >
            <span className="brand-mark">C&P</span>
            <h1>Workspace locked</h1>
            <p>
              Enter your local{" "}
              {record?.type === "password" ? "password" : "PIN"} to continue.
              This access gate does not encrypt saved data.
            </p>
            <Field
              autoFocus
              label="PIN / password"
              type="password"
              autoComplete="off"
              inputMode={record?.type === "password" ? "text" : "numeric"}
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              disabled={busy}
            />
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Unlocking…" : "Unlock"}
            </button>
          </form>
        </main>
      )}
    </Context.Provider>
  );
}
export function usePrivacy() {
  const value = useContext(Context);
  if (!value) throw new Error("Privacy provider missing.");
  return value;
}
