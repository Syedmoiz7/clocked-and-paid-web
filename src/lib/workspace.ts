import { openDB, type DBSchema } from "idb";
import { appReducer, hydrate, initialAppState } from "@/store/appSlice";
import type { AppState } from "@/types";

type Snapshot = { version: 1; revision: number; state: AppState };
interface WorkspaceDatabase extends DBSchema {
  workspace: { key: string; value: Snapshot };
}
export type WorkspaceAction = Parameters<typeof appReducer>[1];
export type WorkspaceCommand = WorkspaceAction | ((state: AppState) => WorkspaceAction);

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
      const action = typeof command === "function" ? command(previous) : command;
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
