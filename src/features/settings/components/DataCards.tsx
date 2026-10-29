"use client";
import { Database, HardDrive, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Field, Modal, Panel, Toggle } from "@/components/Fields";
import {
  Confirm,
  FormFooter,
  usePayForm,
} from "@/features/pay/components/Shared";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import { workInProgress } from "@/features/jobs/model";
import { parseBackup, type ImportData } from "../backup";
import { importImpact } from "../importImpact";
import { useSettingsActions } from "../useSettingsActions";

type Scan = { imported: ImportData; savedAt: string; missing: number };
export function DataCards({
  dirty,
  onRestored,
  onPremium,
}: {
  dirty: boolean;
  onRestored: () => void;
  onPremium: () => void;
}) {
  const data = useApp(),
    { busy: saving, read } = useWorkspace(),
    actions = useSettingsActions();
  const file = useRef<HTMLInputElement>(null),
    pending = useRef(false);
  const [imported, setImported] = useState<ImportData | null>(null),
    [reset, setReset] = useState(false),
    [scan, setScan] = useState<Scan | null>(null),
    [scanned, setScanned] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const run = async (task: () => Promise<void> | void, success = "") => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      setMessage(success);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Data operation failed. Existing records are kept.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const unavailable = saving || busy;
  return (
    <>
      <Panel
        title="Backup & Restore"
        icon={<Database size={16} />}
        subtitle="JSON contains full business data. CSV contains history only. Downloads are unencrypted; credentials, account identity and plan access are excluded."
      >
        {data.isPremium ? (
          <>
            <div className="button-row">
              <button
                disabled={unavailable}
                onClick={() => void run(() => actions.export("json"))}
              >
                Export JSON backup
              </button>
              <button
                disabled={unavailable}
                onClick={() => void run(() => actions.export("csv"))}
              >
                Export history CSV
              </button>
              <button
                disabled={unavailable}
                onClick={() => file.current?.click()}
              >
                Choose backup file…
              </button>
            </div>
            <input
              ref={file}
              aria-label="Backup file"
              type="file"
              accept=".json,.csv,application/json,text/csv"
              hidden
              onChange={(event) => {
                const selected = event.target.files?.[0];
                event.target.value = "";
                if (!selected) return;
                void run(async () => {
                  if (selected.size > 10 * 1024 * 1024)
                    throw new Error("Backup exceeds the 10 MB limit.");
                  if (!read().isPremium)
                    throw new Error("Preview Premium to import backups.");
                  setImported(
                    parseBackup(await selected.text(), selected.name, read()),
                  );
                });
              }}
            />
          </>
        ) : (
          <button onClick={onPremium}>Explore Premium backup tools</button>
        )}
      </Panel>
      <Panel
        title="Data Recovery"
        icon={<HardDrive size={16} />}
        iconTone="blue"
        subtitle="A browser safety snapshot can add missing history. It does not roll back matching-ID edits or replace a full external backup."
      >
        {data.isPremium ? (
          <>
            <button
              disabled={unavailable}
              onClick={() =>
                void run(async () => {
                  setScan(await actions.scan());
                  setScanned(true);
                })
              }
            >
              Scan browser recovery
            </button>
            {scanned && (
              <p>
                {scan
                  ? `Snapshot ${new Date(scan.savedAt).toLocaleString()} · ${scan.missing} missing ${scan.missing === 1 ? "entry" : "entries"}`
                  : "No browser recovery snapshot is available."}
              </p>
            )}
            {scan && scan.missing > 0 && (
              <button
                disabled={unavailable}
                onClick={() =>
                  void run(async () => {
                    const error = await actions.recover(scan.imported);
                    if (error) throw new Error(error);
                    setScan(await actions.scan());
                  }, "Missing history recovered. Current records and timers were kept.")
                }
              >
                Recover missing history
              </button>
            )}
          </>
        ) : (
          <button onClick={onPremium}>Explore Premium recovery tools</button>
        )}
      </Panel>
      <Panel
        title="Danger Zone"
        icon={<ShieldAlert size={16} />}
        iconTone="danger"
        variant="danger"
        subtitle="Reset business records, local defaults and recovery. Your account/demo mode and privacy lock are retained."
      >
        <button
          className="danger"
          disabled={unavailable}
          onClick={() => setReset(true)}
        >
          Reset local data…
        </button>
      </Panel>
      {busy && <p role="status">Working…</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {imported && (
        <ImportReview
          imported={imported}
          dirty={dirty}
          onClose={() => setImported(null)}
          onImport={async (mode, includeSettings) => {
            if (dirty && includeSettings)
              return "Save or discard App preferences before restoring backup preferences.";
            const error = await actions.import(imported, mode, includeSettings);
            if (!error) {
              if (includeSettings) onRestored();
              setMessage("Backup restored in this browser.");
            }
            return error;
          }}
        />
      )}
      {reset && (
        <ResetDialog
          onClose={() => setReset(false)}
          onReset={async () => {
            const error = await actions.reset();
            if (!error) {
              onRestored();
              setScan(null);
              setScanned(false);
              setMessage("Local business data and recovery were cleared.");
            }
            return error;
          }}
        />
      )}
    </>
  );
}
function ImportReview({
  imported,
  dirty,
  onClose,
  onImport,
}: {
  imported: ImportData;
  dirty: boolean;
  onClose: () => void;
  onImport: (
    mode: "merge" | "replace",
    settings: boolean,
  ) => Promise<string | null>;
}) {
  const data = useApp(),
    [mode, setMode] = useState<"merge" | "replace">("merge"),
    [include, setInclude] = useState(false);
  const working = workInProgress(data);
  useEffect(() => {
    if (dirty) setInclude(false);
  }, [dirty]);
  useEffect(() => {
    if (working) setMode("merge");
  }, [working]);
  const form = usePayForm(() => onImport(mode, include), onClose);
  return (
    <Modal title="Review import" onClose={onClose} busy={form.saving}>
      <form onSubmit={form.submit}>
        <fieldset disabled={form.saving}>
          <p>
            {imported.history.length} history entries ·{" "}
            {imported.jobs?.length ?? 0} jobs ·{" "}
            {imported.deductions?.length ?? 0} deductions ·{" "}
            {imported.paychecks?.length ?? 0} receipts
          </p>
          {imported.warnings.map((warning) => (
            <p key={warning} className="warning">
              {warning}
            </p>
          ))}
          <label className="field">
            <span>Import mode</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as typeof mode)}
            >
              <option value="merge">Merge (keep existing IDs)</option>
              <option value="replace" disabled={working}>
                Replace included collections
              </option>
            </select>
          </label>
          {working && (
            <p>
              Finish or recover current work before replacing collections. Merge
              keeps current sessions.
            </p>
          )}
          <ul className="import-impact">
            {importImpact(data, imported, mode).map((row) => (
              <li key={row.label}>
                <strong>{row.label}: </strong>
                {row.included
                  ? `${row.incoming} in file · ${row.added} new IDs · ${row.conflicts} matching IDs ${mode === "merge" ? "kept" : "replaced"}${mode === "replace" ? ` · ${row.removed} current records removed` : ""}`
                  : "not included; current records kept"}
              </li>
            ))}
          </ul>
          <p>
            Only included collections are replaced. Imported unfinished work
            stays as drafts, without starting timers.
          </p>
          <Toggle
            label="Restore backup preferences"
            checked={include}
            disabled={dirty || !imported.settings}
            onChange={setInclude}
          />
          {dirty && (
            <p>
              Save or discard App preferences before opting into backup
              preferences.
            </p>
          )}
          {!imported.settings && <p>This file contains no preferences.</p>}
        </fieldset>
        <FormFooter {...form} label="Restore backup" onClose={onClose} />
      </form>
    </Modal>
  );
}
function ResetDialog({
  onClose,
  onReset,
}: {
  onClose: () => void;
  onReset: () => Promise<string | null>;
}) {
  const [text, setText] = useState(""),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Modal title="Reset local data" busy={confirm} onClose={onClose}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (text !== "RESET") setError("Type RESET exactly to continue.");
            else setConfirm(true);
          }}
        >
          <fieldset>
            <p>
              This clears shifts, jobs, paychecks, deductions, preferences and
              recovery. Export a JSON backup before resetting.
            </p>
            <Field
              label="Type RESET to continue"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </fieldset>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <footer className="form-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">Continue to final confirmation</button>
          </footer>
        </form>
      </Modal>
      {confirm && (
        <Confirm
          title="Permanently reset this workspace?"
          label="Reset workspace"
          onClose={() => setConfirm(false)}
          action={async () => {
            const error = await onReset();
            if (!error) onClose();
            return error;
          }}
        >
          <p>
            Business data and the browser recovery snapshot will be removed
            together. The privacy lock and account/demo mode will remain. This
            cannot be undone.
          </p>
        </Confirm>
      )}
    </>
  );
}
