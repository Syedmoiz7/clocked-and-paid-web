import { openDB, type DBSchema } from "idb";
import {
  appReducer,
  hydrate,
  initialAppState,
  resetLocalData,
  restoreData,
} from "@/store/appSlice";
import { preserveWorkspacePricing } from "@/features/settings/drafts";
import { backupText, parseBackup } from "@/features/settings/backup";
import type { AppState } from "@/types";

type Snapshot = {
  version: 1;
  revision: number;
  state: AppState;
  savedAt?: string;
};
interface WorkspaceDatabase extends DBSchema {
  workspace: { key: string; value: Snapshot };
}
export type WorkspaceAction = Parameters<typeof appReducer>[1];
export type WorkspaceCommand =
  WorkspaceAction | ((state: AppState) => WorkspaceAction);

export const workspaceRepository = {
  async database() {
    return openDB<WorkspaceDatabase>("clocked-paid-web", 1, {
      upgrade(db) {
        db.createObjectStore("workspace");
      },
    });
  },
  async load(startup = true): Promise<Snapshot | null> {
    const db = await this.database();
    try {
      const saved = await db.get("workspace", "current");
      if (!saved) return null;
      if (
        saved.version !== 1 ||
        !Number.isInteger(saved.revision) ||
        !saved.state ||
        !Array.isArray(saved.state.history)
      )
        throw new Error(
          "The saved workspace could not be read. It has not been overwritten.",
        );
      return {
        ...saved,
        state: startup
          ? appReducer(initialAppState, hydrate(saved.state))
          : saved.state,
      };
    } finally {
      db.close();
    }
  },
  async recovery(): Promise<Snapshot | null> {
    const db = await this.database();
    try {
      const saved = await db.get("workspace", "recovery");
      if (!saved) return null;
      if (
        saved.version !== 1 ||
        !saved.savedAt ||
        !Array.isArray(saved.state?.history)
      )
        throw new Error("The browser recovery snapshot could not be read.");
      return saved;
    } finally {
      db.close();
    }
  },
  async raw() {
    const db = await this.database();
    try {
      return await db.get("workspace", "current");
    } finally {
      db.close();
    }
  },
  async emergencyRestore() {
    const db = await this.database(),
      tx = db.transaction("workspace", "readwrite");
    try {
      const current = await tx.store.get("current");
      if (
        current?.version === 1 &&
        Number.isInteger(current.revision) &&
        Array.isArray(current.state?.history)
      )
        throw new Error(
          "The workspace is readable now. Retry opening it instead.",
        );
      const recovery = await tx.store.get("recovery");
      if (!recovery?.state || !Array.isArray(recovery.state.history))
        throw new Error("No readable recovery snapshot is available.");
      const imported = parseBackup(
        backupText(recovery.state),
        "recovery.json",
        initialAppState,
      );
      const state = appReducer(
        initialAppState,
        restoreData({ imported, mode: "replace", includeSettings: false }),
      );
      if (current) await tx.store.put(current, "unreadable-copy");
      await tx.store.put(
        {
          version: 1,
          revision: Number.isInteger(current?.revision)
            ? current!.revision + 1
            : 1,
          state,
        },
        "current",
      );
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => {});
      throw error;
    } finally {
      db.close();
    }
  },
  async commit(
    command: WorkspaceCommand,
    fallback: AppState,
  ): Promise<Snapshot & { changed: boolean }> {
    const db = await this.database();
    const tx = db.transaction("workspace", "readwrite");
    try {
      // One read/write transaction also serializes changes from other tabs.
      const before = await tx.store.get("current");
      if (
        before &&
        (before.version !== 1 ||
          !Number.isInteger(before.revision) ||
          !Array.isArray(before.state?.history))
      ) {
        throw new Error(
          "The saved workspace is unreadable. No changes were written.",
        );
      }
      const previous = before?.state ?? fallback;
      const action =
        typeof command === "function" ? command(previous) : command;
      const state = appReducer(previous, action);
      if (state === previous && before) {
        await tx.done;
        return { ...before, changed: false };
      }
      const next: Snapshot = {
        version: 1,
        revision: (before?.revision ?? 0) + 1,
        state,
      };
      if (resetLocalData.match(action)) {
        await tx.store.delete("recovery");
      } else {
        const saved = await tx.store.get("recovery");
        const old = saved?.state;
        const replacement =
          restoreData.match(action) && action.payload.mode === "replace";
        if (replacement) {
          const prior = preserveWorkspacePricing(previous),
            incoming = preserveWorkspacePricing(state);
          const safety =
            old && Array.isArray(old.history)
              ? preserveWorkspacePricing(old)
              : prior;
          const recovery = {
            ...prior,
            history: [
              ...new Map(
                [...safety.history, ...incoming.history, ...prior.history].map(
                  (entry) => [entry.id, entry],
                ),
              ).values(),
            ],
            jobs: [
              ...new Map(
                [...safety.jobs, ...incoming.jobs, ...prior.jobs].map((job) => [
                  job.id,
                  job,
                ]),
              ).values(),
            ],
          };
          await tx.store.put(
            { ...next, state: recovery, savedAt: new Date().toISOString() },
            "recovery",
          );
        } else if (
          (!old ||
            !Array.isArray(old.history) ||
            state.history.length >= old.history.length) &&
          (state.history.length || state.jobs.length)
        ) {
          await tx.store.put(
            { ...next, state, savedAt: new Date().toISOString() },
            "recovery",
          );
        }
      }
      await tx.store.put(next, "current");
      await tx.done;
      return { ...next, changed: true };
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* A failed transaction may already be closed. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    } finally {
      db.close();
    }
  },
};
