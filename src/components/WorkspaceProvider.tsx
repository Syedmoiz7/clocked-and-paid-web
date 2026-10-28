"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Provider, useSelector } from "react-redux";
import { makeStore, replaceWorkspace, type AppStore } from "@/lib/store";
import { workspaceRepository, type WorkspaceCommand } from "@/lib/workspace";
import { enterGuest, refreshTrackerDay } from "@/store/appSlice";
import { localDate } from "@/utils/dateOnly";
import type { AppState } from "@/types";

const Context = createContext<{
  commit: (action: WorkspaceCommand) => Promise<boolean>;
  read: () => AppState;
  busy: boolean;
  message: string;
  notify: (message: string) => void;
} | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);
  const [ready, setReady] = useState(false),
    [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false),
    [message, notify] = useState("");
  const pending = useRef(false),
    revision = useRef(0),
    channel = useRef<BroadcastChannel | null>(null);
  const read = useCallback(() => store.getState().app, [store]);
  const commit = useCallback(
    async (action: WorkspaceCommand) => {
      if (pending.current) {
        notify("Please wait for the current save to finish.");
        return false;
      }
      pending.current = true;
      setBusy(true);
      try {
        const next = await workspaceRepository.commit(action, read());
        if (next.revision >= revision.current) {
          revision.current = next.revision;
          store.dispatch(replaceWorkspace(next.state));
        }
        channel.current?.postMessage({ revision: next.revision });
        if (!next.changed)
          notify(
            "No change was saved. The workspace may have changed in another tab; review the current values.",
          );
        return next.changed;
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Could not save. Your inputs have been kept; try again.",
        );
        return false;
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [read, store],
  );

  useEffect(() => {
    let active = true;
    workspaceRepository
      .load()
      .then(async (loaded) => {
        const saved =
          loaded ?? (await workspaceRepository.commit(enterGuest(), read()));
        if (!active) return;
        if (saved) {
          store.dispatch(replaceWorkspace(saved.state));
          revision.current = saved.revision;
        }
        setReady(true);
      })
      .catch(() => {
        if (active)
          setLoadError(
            "Browser storage could not be loaded. Existing data has not been replaced. Allow site storage, then retry.",
          );
      });
    if (typeof BroadcastChannel !== "undefined") {
      const broadcast = new BroadcastChannel("clocked-paid-web");
      channel.current = broadcast;
      broadcast.onmessage = () => {
        void workspaceRepository
          .load(false)
          .then((saved) => {
            if (active && saved && saved.revision > revision.current) {
              revision.current = saved.revision;
              store.dispatch(replaceWorkspace(saved.state));
            }
          })
          .catch(() =>
            notify(
              "Could not refresh changes from another tab. Reload to retry.",
            ),
          );
      };
    }
    return () => {
      active = false;
      channel.current?.close();
      channel.current = null;
    };
  }, [store]);
  useEffect(() => {
    if (!ready) return;
    const refresh = () => {
      if (read().trackerDay !== localDate())
        void commit(refreshTrackerDay(localDate()));
    };
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [ready, commit, read]);

  return (
    <Provider store={store}>
      <Context.Provider value={{ commit, read, busy, message, notify }}>
        {ready ? (
          children
        ) : (
          <main className="loading">
            <div className="brand-mark">C&P</div>
            <h1>{loadError ? "Workspace unavailable" : "Clocked & Paid"}</h1>
            <p>{loadError || "Opening your workspace…"}</p>
            {loadError && (
              <button onClick={() => window.location.reload()}>Retry</button>
            )}
          </main>
        )}
      </Context.Provider>
    </Provider>
  );
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider missing");
  return value;
}
export const useApp = () =>
  useSelector((state: ReturnType<AppStore["getState"]>) => state.app);
