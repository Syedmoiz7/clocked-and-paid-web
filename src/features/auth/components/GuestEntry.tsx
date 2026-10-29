"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useAuthActions } from "../useAuthActions";
import { usePrivacy } from "@/features/settings/components/PrivacyProvider";
import { AuthError, AuthLayout } from "./Controls";

export function GuestEntry() {
  const actions = useAuthActions(),
    privacy = usePrivacy(),
    { read } = useWorkspace();
  const started = useRef(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const enter = async () => {
    setBusy(true);
    setError("");
    try {
      if (read().auth.session === "mock") actions.current();
      else await actions.guest();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not open your workspace. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (privacy.locked || started.current) return;
    started.current = true;
    void enter();
  }, [privacy.locked]);
  return (
    <AuthLayout>
      <h2>Opening your workspace</h2>
      <p>Your saved work stays in this browser.</p>
      <AuthError message={error} />
      {error && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => void enter()}
        >
          Try again
        </button>
      )}
      <Link href="/">Back to home</Link>
    </AuthLayout>
  );
}
