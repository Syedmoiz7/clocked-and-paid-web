"use client";
import { useWorkspace } from "@/components/WorkspaceProvider";
import {
  saveSettings,
  setThemeHue,
  setMockAccount,
  signOutMockSession,
  enterMockSession,
  restoreData,
  resetLocalData,
} from "@/store/appSlice";
import {
  settingsDraft,
  prepareAccountUpdate,
  themeOptions,
  validatePassword,
  type SettingsDraft,
} from "./model";
import { prepareSettingsSave } from "./drafts";
import { recoveryImport } from "./recovery";
import { backupText, csvText, parseBackup, type ImportData } from "./backup";
import { workspaceRepository, type WorkspaceCommand } from "@/lib/workspace";
import { saveMockPassword } from "@/lib/browserCredentials";
import type { MockAccount } from "@/types";
import { downloadText } from "@/lib/download";
export function useSettingsActions() {
  const { commit, read, notify } = useWorkspace();
  const save = async (command: WorkspaceCommand) => {
    let error: string | null = null;
    const changed = await commit((latest) => {
      try {
        return typeof command === "function" ? command(latest) : command;
      } catch (value) {
        error =
          value instanceof Error ? value.message : "Review the current values.";
        throw value;
      }
    });
    return changed
      ? null
      : (error ?? "Changes were not saved. Your inputs are kept; try again.");
  };
  return {
    preferences: (draft: SettingsDraft, base: SettingsDraft) =>
      save((latest) => {
        const result = prepareSettingsSave(latest, draft, base);
        if (result.error) throw new Error(result.error);
        if (
          !latest.isPremium &&
          result.draft.preferences.allowConcurrentShifts &&
          !latest.preferences.allowConcurrentShifts
        )
          throw new Error("Preview Premium to enable concurrent jobs.");
        return saveSettings(result.draft);
      }),
    hue: (hue: number) =>
      save((latest) => {
        if (!themeOptions.some((option) => option.hue === hue))
          throw new Error("Choose a supported theme.");
        if (hue !== 338 && !latest.isPremium)
          throw new Error("Preview Premium to use the full palette.");
        return setThemeHue(hue);
      }),
    account: (changes: Partial<Pick<MockAccount, "name" | "email">>) =>
      save((latest) => {
        const result = prepareAccountUpdate(latest.account, changes);
        if (result.error) throw new Error(result.error);
        return setMockAccount(result.account!);
      }),
    signIn: (name: string, email: string) =>
      save(
        enterMockSession({
          mode: "mock",
          name: name.trim() || "Demo user",
          email: email.trim(),
        }),
      ),
    signOut: () => save(signOutMockSession()),
    password: async (value: string, confirmation: string) => {
      const error = validatePassword(value, confirmation);
      if (error) return error;
      if (read().account.mode !== "mock")
        return "Enter mock account mode before changing the password.";
      try {
        await saveMockPassword(value);
        return null;
      } catch {
        return "Could not save the local password digest. Your inputs are kept.";
      }
    },
    export: (format: "json" | "csv") => {
      const data = read();
      if (!data.isPremium)
        throw new Error("Preview Premium to export backups.");
      downloadText(
        format === "json" ? backupText(data) : `\uFEFF${csvText(data)}`,
        `clocked-paid-${new Date().toISOString().slice(0, 10)}.${format}`,
        format === "json" ? "application/json" : "text/csv;charset=utf-8",
      );
      notify(
        "Download requested. Confirm the file was saved in your browser downloads.",
      );
    },
    import: (
      imported: ImportData,
      mode: "merge" | "replace",
      includeSettings: boolean,
    ) =>
      save((latest) => {
        if (!latest.isPremium)
          throw new Error("Preview Premium to restore backups.");
        return restoreData({ imported, mode, includeSettings });
      }),
    scan: async () => {
      if (!read().isPremium)
        throw new Error("Preview Premium to scan recovery.");
      const snapshot = await workspaceRepository.recovery();
      if (!snapshot) return null;
      const imported = parseBackup(
        backupText(snapshot.state),
        "recovery.json",
        read(),
      );
      return {
        imported,
        savedAt: snapshot.savedAt!,
        missing: recoveryImport(read(), imported).history.length,
      };
    },
    recover: (imported: ImportData) =>
      save((latest) => {
        if (!latest.isPremium)
          throw new Error("Preview Premium to recover history.");
        const fresh = recoveryImport(latest, imported);
        if (!fresh.history.length)
          throw new Error("No missing entries remain. Scan again.");
        return restoreData({
          imported: fresh,
          mode: "merge",
          includeSettings: false,
        });
      }),
    reset: () => save(resetLocalData()),
    currentDraft: () => settingsDraft(read()),
  };
}
