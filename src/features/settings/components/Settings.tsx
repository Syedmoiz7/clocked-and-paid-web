"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, useWorkspace } from "@/components/WorkspaceProvider";
import { rebaseSettingsDraft, sameValue } from "../drafts";
import { settingsDraft } from "../model";
import { useSettingsActions } from "../useSettingsActions";
import { Account } from "./Account";
import { PreferenceCards } from "./PreferenceCards";
import { Appearance, PayPreview } from "./Appearance";
import { PrivacyCard } from "./PrivacyCard";
import { DataCards } from "./DataCards";

export function Settings() {
  const data = useApp(),
    { busy, notify } = useWorkspace(),
    actions = useSettingsActions(),
    router = useRouter();
  const [tab, setTab] = useState("account"),
    [draft, setDraft] = useState(() => settingsDraft(data)),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const previous = useRef(settingsDraft(data)),
    pending = useRef(false),
    source = settingsDraft(data);
  useEffect(() => {
    const before = previous.current;
    previous.current = source;
    setDraft((value) => rebaseSettingsDraft(value, before, source));
  }, [data.preferences, data.defaultPlan, data.breakIncludedInRemaining]);
  const dirty = !sameValue(draft, source);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const resetDraft = () => {
    const value = actions.currentDraft();
    setDraft(value);
    previous.current = value;
    setError("");
    setMessage("");
  };
  const premium = () => {
    if (dirty)
      setError("Save or discard App preferences before opening Plans.");
    else router.push("/plans?returnTo=settings");
  };
  const save = async () => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const error = await actions.preferences(draft, previous.current);
      if (error) setError(error);
      else {
        resetDraft();
        setMessage("Preferences saved in this browser.");
      }
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Personalize</p>
          <h1>Settings</h1>
          <p>Manage your account, appearance, and app preferences.</p>
        </div>
      </div>
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Settings sections"
      >
        {["account", "app"].map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`settings-${value}`}
            id={`settings-tab-${value}`}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "account"
                  : event.key === "End"
                    ? "app"
                    : value === "account"
                      ? "app"
                      : "account";
              setTab(next);
              document.getElementById(`settings-tab-${next}`)?.focus();
            }}
            tabIndex={tab === value ? 0 : -1}
          >
            {value === "account" ? "Account" : "App"}
          </button>
        ))}
      </div>
      <div className="settings-plan">
        <span>
          {data.isPremium ? "Premium preview" : "Free plan"} · local demo only
        </span>
        <button onClick={premium}>Manage plan</button>
      </div>
      <div
        id="settings-account"
        role="tabpanel"
        aria-labelledby="settings-tab-account"
        hidden={tab !== "account"}
      >
        <Account unsaved={dirty} />
      </div>
      <div
        id="settings-app"
        role="tabpanel"
        aria-labelledby="settings-tab-app"
        hidden={tab !== "app"}
        className="settings-cards"
      >
        <PreferenceCards
          draft={draft}
          onChange={(value) => {
            setDraft(value);
            setError("");
            setMessage("");
          }}
          disabled={busy || saving}
          premium={data.isPremium}
          onPremium={premium}
        />
        <Appearance
          data={data}
          busy={busy || saving}
          onHue={(hue) => {
            if (hue !== 338 && !data.isPremium) premium();
            else
              void actions
                .hue(hue)
                .then((error) =>
                  notify(error ?? "Theme saved in this browser."),
                );
          }}
        />
        <PrivacyCard />
        <DataCards dirty={dirty} onRestored={resetDraft} onPremium={premium} />
        <PayPreview data={data} draft={draft} />
      </div>
      {error && (
        <p role="alert" className="error settings-feedback">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="settings-feedback">
          {message}
        </p>
      )}
      {dirty && (
        <div
          className="settings-save-bar"
          role="region"
          aria-label="Unsaved preferences"
        >
          <strong>Unsaved App preferences</strong>
          <div className="button-row">
            <button
              disabled={busy || saving}
              onClick={() => {
                resetDraft();
                setMessage("Changes discarded.");
              }}
            >
              Discard
            </button>
            <button
              className="primary"
              disabled={busy || saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </>
  );
}
