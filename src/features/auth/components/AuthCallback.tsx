"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/WorkspaceProvider";
import { validDemoFlow } from "../model";
import { callbackParams } from "../routing";
import { useAuthActions } from "../useAuthActions";
import { AuthLayout, AuthField, AuthError, useAuthTask } from "./Controls";

export function AuthCallback() {
  const data = useApp(),
    actions = useAuthActions(),
    task = useAuthTask(),
    router = useRouter();
  const [params, setParams] = useState<ReturnType<
      typeof callbackParams
    > | null>(null),
    [now, setNow] = useState(Date.now()),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    let lastUrl = "";
    const tick = () => {
      if (lastUrl !== window.location.href) {
        const params = callbackParams(
          window.location.search,
          window.location.hash,
        );
        setParams(params);
        setDone(false);
        setPassword("");
        setConfirmation("");
        if (params.external)
          window.history.replaceState(
            window.history.state,
            "",
            "/auth-callback",
          );
        lastUrl = window.location.href;
      }
      setNow(Date.now());
    };
    tick();
    const timer = setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    window.addEventListener("hashchange", tick);
    window.addEventListener("popstate", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      window.removeEventListener("hashchange", tick);
      window.removeEventListener("popstate", tick);
    };
  }, []);
  const valid =
    params && !params.external && validDemoFlow(data.auth.pending, params, now);
  const back = () =>
    void task.run(async () => {
      if (params?.id) await actions.cancel(params.id);
      setPassword("");
      setConfirmation("");
      router.replace("/auth");
    });
  return (
    <AuthLayout>
      {!params ? (
        <p>Checking local link…</p>
      ) : done ? (
        <div className="form-stack">
          <h2>Mock password updated</h2>
          <p>
            A salted password digest was saved locally. No server credential
            changed. Mock sign-in still accepts any non-empty credentials.
          </p>
          <button onClick={back} disabled={task.busy}>
            Back to Sign In
          </button>
        </div>
      ) : !valid ? (
        <div className="form-stack">
          <h2>Link unavailable</h2>
          <p className="auth-message error" role="alert">
            {params.external
              ? "Real authentication links need the future backend adapter. Tokens were not exchanged or saved."
              : "This mock link is missing, expired or already used. Prepare a new confirmation or recovery link."}
          </p>
          <button onClick={back} disabled={task.busy}>
            Back to Sign In
          </button>
        </div>
      ) : (
        <form
          className="form-stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void task.run(async () => {
              if (params.flow === "confirmation") await actions.confirm(params);
              else {
                await actions.resetPassword(params, password, confirmation);
                setPassword("");
                setConfirmation("");
                setDone(true);
              }
            });
          }}
        >
          <h2>
            {params.flow === "confirmation"
              ? "Confirm mock account"
              : "Set new password"}
          </h2>
          <p>{data.auth.pending?.email} · local preview only</p>
          {params.flow === "recovery" && (
            <>
              <AuthField
                label="New password (6+ characters)"
                password
                value={password}
                onChange={setPassword}
                disabled={task.busy}
              />
              <AuthField
                label="Confirm password"
                password
                value={confirmation}
                onChange={setConfirmation}
                disabled={task.busy}
              />
            </>
          )}
          <AuthError message={task.error} />
          <button className="primary" disabled={task.busy}>
            {task.busy
              ? "Please wait…"
              : params.flow === "confirmation"
                ? "Confirm & continue (mock)"
                : "Set Password (mock)"}
          </button>
          <button type="button" disabled={task.busy} onClick={back}>
            Cancel
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
