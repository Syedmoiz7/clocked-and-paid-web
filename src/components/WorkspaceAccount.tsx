"use client";
import Link from "next/link";
import { useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { useApp, useWorkspace } from "./WorkspaceProvider";
import { Confirm } from "@/features/pay/components/Shared";
import { useSettingsActions } from "@/features/settings/useSettingsActions";

export function WorkspaceAccount() {
  const data = useApp(),
    { busy } = useWorkspace(),
    actions = useSettingsActions();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="workspace-account">
      {data.auth.session === "guest" ? (
        <>
          <span className="guest-badge">Guest</span>
          <Link
            className="account-action"
            href="/auth"
            aria-label="Sign In"
            title="Sign in with mock data"
          >
            <LogIn size={16} aria-hidden="true" />
            <span>Sign In</span>
          </Link>
        </>
      ) : (
        <button
          className="account-action"
          aria-label="Sign out"
          title="Sign out of mock account"
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          <LogOut size={16} aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      )}
      {confirm && (
        <Confirm
          title="Sign out?"
          label="Sign out"
          action={actions.signOut}
          onClose={() => setConfirm(false)}
        >
          <p>
            Return to sign-in and keep your saved work, settings and privacy
            lock. Unsaved inputs on this page will be discarded.
          </p>
        </Confirm>
      )}
    </div>
  );
}
