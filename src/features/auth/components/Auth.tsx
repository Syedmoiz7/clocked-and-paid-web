"use client";
import { useId, useState } from "react";
import { useApp } from "@/components/WorkspaceProvider";
import { useAuthActions } from "../useAuthActions";
import { AuthLayout, AuthField, AuthError, useAuthTask } from "./Controls";
import { PlanCards, type PlanChoice } from "./PlanCards";

type View = "sign-in" | "sign-up" | "forgot" | "profile";
export function Auth({ initialView }: { initialView?: "sign-up" }) {
  const modeId = useId(),
    data = useApp(),
    actions = useAuthActions(),
    task = useAuthTask();
  const [view, setView] = useState<View>(
      () => initialView ?? (data.auth.lastProfile ? "profile" : "sign-in"),
    ),
    [email, setEmail] = useState(data.auth.lastProfile?.email ?? ""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [info, setInfo] = useState("");
  const [plan, setPlan] = useState<PlanChoice>(
    data.auth.pending?.plan ?? (data.isPremium ? "premium" : "free"),
  );
  const pending = data.auth.pending,
    remembered = data.auth.lastProfile;
  const changeView = (next: View) => {
    if (task.busy) return;
    setView(next);
    setPassword("");
    setConfirmation("");
    task.setError("");
    setInfo("");
  };
  const back = () =>
    void task.run(async () => {
      await actions.cancel(pending?.id);
      changeView(remembered ? "profile" : "sign-in");
      setPassword("");
      setConfirmation("");
    });
  return (
    <AuthLayout wide={view === "sign-up" && !pending}>
      {pending ? (
        <div className="form-stack">
          <span className="auth-symbol">
            {pending.kind === "confirmation" ? "✓" : "↗"}
          </span>
          <h2>
            {pending.kind === "confirmation"
              ? "Confirm your mock account"
              : "Mock reset link ready"}
          </h2>
          <p>
            For {pending.email}. This is a demonstration; no email was sent.
          </p>
          {pending.kind === "confirmation" && pending.plan && (
            <p>
              Selected plan:{" "}
              <strong>
                {pending.plan === "premium"
                  ? "Premium preview (no charge)"
                  : "Free · Ad-supported"}
              </strong>
              . Activation waits for confirmation.
            </p>
          )}
          <button
            className="primary"
            disabled={task.busy}
            onClick={actions.callback}
          >
            {pending.kind === "confirmation"
              ? "Open mock confirmation"
              : "Open mock password recovery"}
          </button>
          {pending.kind === "confirmation" && (
            <button
              disabled={task.busy}
              onClick={() =>
                void task.run(async () => {
                  await actions.resend();
                  setInfo(
                    "A fresh mock confirmation is ready. Previous demo links are invalid; no email was sent.",
                  );
                })
              }
            >
              Prepare confirmation again (no email)
            </button>
          )}
          <button disabled={task.busy} onClick={back}>
            Back to Sign In
          </button>
        </div>
      ) : (
        <>
          {(view === "sign-in" || view === "sign-up") && (
            <div
              className="auth-tabs"
              role="tablist"
              aria-label="Authentication mode"
            >
              {(["sign-in", "sign-up"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  id={`${modeId}-${value}`}
                  aria-controls={`${modeId}-panel`}
                  aria-selected={view === value}
                  tabIndex={view === value ? 0 : -1}
                  disabled={task.busy}
                  onClick={() => changeView(value)}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? "sign-in"
                        : event.key === "End"
                          ? "sign-up"
                          : value === "sign-in"
                            ? "sign-up"
                            : "sign-in";
                    changeView(next);
                    document.getElementById(`${modeId}-${next}`)?.focus();
                  }}
                >
                  {value === "sign-in" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>
          )}
          {view === "forgot" ? (
            <form
              className="form-stack"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void task.run(async () => {
                  await actions.recover(email);
                  setPassword("");
                  setConfirmation("");
                });
              }}
            >
              <h2>Forgot password?</h2>
              <p>
                Preview password recovery locally. No reset email will be sent.
              </p>
              <AuthField
                label="Email"
                email
                value={email}
                onChange={setEmail}
                disabled={task.busy}
              />
              <button className="primary" disabled={task.busy}>
                {task.busy ? "Preparing…" : "Prepare mock reset link"}
              </button>
              <button
                type="button"
                disabled={task.busy}
                onClick={() => changeView(remembered ? "profile" : "sign-in")}
              >
                Back to Sign In
              </button>
            </form>
          ) : (
            <form
              className="form-stack"
              noValidate
              id={`${modeId}-panel`}
              role={view === "profile" ? undefined : "tabpanel"}
              aria-labelledby={
                view === "profile" ? undefined : `${modeId}-${view}`
              }
              onSubmit={(event) => {
                event.preventDefault();
                void task.run(async () => {
                  if (view === "sign-up")
                    await actions.signUp(
                      { name, email, password, confirmation },
                      plan,
                    );
                  else
                    await actions.signIn({
                      email:
                        view === "profile" && remembered
                          ? remembered.email
                          : email,
                      password,
                    });
                  setPassword("");
                  setConfirmation("");
                });
              }}
            >
              {view === "profile" && remembered ? (
                <div className="saved-profile">
                  <span className="profile-avatar">
                    {(remembered.name || remembered.email)
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                  <h2>
                    Welcome back,{" "}
                    {remembered.name || remembered.email.split("@")[0]}
                  </h2>
                  <p>{remembered.email}</p>
                </div>
              ) : (
                <>
                  <h2>
                    {view === "sign-up" ? "Create your account" : "Sign In"}
                  </h2>
                  {view === "sign-up" && (
                    <AuthField
                      label="Your name"
                      name
                      value={name}
                      onChange={setName}
                      disabled={task.busy}
                    />
                  )}
                  <AuthField
                    label="Email"
                    email
                    value={email}
                    onChange={setEmail}
                    disabled={task.busy}
                  />
                </>
              )}
              <AuthField
                label="Password"
                password
                value={password}
                onChange={setPassword}
                disabled={task.busy}
              />
              {view === "sign-up" && (
                <>
                  <AuthField
                    label="Confirm password"
                    password
                    value={confirmation}
                    onChange={setConfirmation}
                    disabled={task.busy}
                  />
                  <PlanCards
                    value={plan}
                    onChange={setPlan}
                    disabled={task.busy}
                  />
                </>
              )}
              <button className="primary" disabled={task.busy}>
                {task.busy
                  ? "Please wait…"
                  : view === "sign-up"
                    ? "Create Account (mock)"
                    : "Sign In"}
              </button>
              {view !== "sign-up" && (
                <button
                  type="button"
                  disabled={task.busy}
                  onClick={() => {
                    if (view === "profile" && remembered)
                      setEmail(remembered.email);
                    changeView("forgot");
                  }}
                >
                  Forgot password?
                </button>
              )}
              {view === "profile" && (
                <button
                  type="button"
                  disabled={task.busy}
                  onClick={() => {
                    setEmail("");
                    changeView("sign-in");
                  }}
                >
                  Use another account
                </button>
              )}
            </form>
          )}
        </>
      )}
      <AuthError message={task.error} />
      {info && (
        <p className="auth-message" role="status">
          {info}
        </p>
      )}
      <div className="auth-guest">
        <p>
          Any non-empty mock email/password can sign in. Existing work and
          settings stay in this browser workspace; changing identities does not
          create separate accounts or cloud storage.
        </p>
        <button
          disabled={task.busy}
          onClick={() => void task.run(actions.guest)}
        >
          Continue as Guest
        </button>
        {data.auth.session !== "signed-out" && (
          <button disabled={task.busy} onClick={actions.current}>
            Back to current workspace
          </button>
        )}
      </div>
    </AuthLayout>
  );
}
