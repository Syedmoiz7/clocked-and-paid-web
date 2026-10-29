"use client";
import { useState } from "react";
import { workspaceRepository } from "@/lib/workspace";
import { backupText } from "../backup";
import { downloadText } from "@/lib/download";
import { Confirm } from "@/features/pay/components/Shared";

export function EmergencyRecovery() {
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const exportSaved = async (recovery: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      const value = recovery
        ? await workspaceRepository.recovery()
        : await workspaceRepository.raw();
      if (!value) throw new Error("No saved copy is available.");
      downloadText(
        recovery ? backupText(value.state) : JSON.stringify(value, null, 2),
        recovery
          ? "clocked-paid-emergency-recovery.json"
          : "clocked-paid-unreadable-workspace.json",
      );
      setMessage(
        "Download requested. Confirm it was saved before changing browser storage. Existing data was not overwritten.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not read browser storage.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="form-stack">
      <p>
        You can download a recovery copy or the raw workspace for safekeeping
        without replacing the unreadable data.
      </p>
      <button disabled={busy} onClick={() => void exportSaved(true)}>
        Download emergency recovery
      </button>
      <button disabled={busy} onClick={() => void exportSaved(false)}>
        Download raw workspace
      </button>
      <button disabled={busy} onClick={() => setRestoring(true)}>
        Review emergency recovery
      </button>
      {restoring && (
        <Confirm
          title="Recover unreadable workspace?"
          label="Restore recovery copy"
          onClose={() => setRestoring(false)}
          action={async () => {
            try {
              await workspaceRepository.emergencyRestore();
              window.location.reload();
              return null;
            } catch (error) {
              return error instanceof Error
                ? error.message
                : "Recovery failed. Existing data was kept.";
            }
          }}
        >
          <p>
            Download the raw workspace first. This restores validated business
            data from the browser recovery snapshot, keeps a raw unreadable
            copy, and retains the privacy lock. Account identity, Premium access
            and backup preferences are not restored. No work timers are started.
          </p>
        </Confirm>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
