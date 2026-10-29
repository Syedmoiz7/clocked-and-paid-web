"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/Fields";
import { useApp } from "@/components/WorkspaceProvider";
import {
  canReuseStarter,
  entryDestination,
  type OnboardingJobDraft,
} from "../model";
import { entitlementsFor } from "@/services/entitlements";
import { currencies } from "@/features/jobs/model";
import { money } from "@/features/history/model";
import { useAuthActions } from "../useAuthActions";
import { AuthLayout, AuthError, useAuthTask } from "./Controls";

export function Onboarding() {
  const data = useApp(),
    actions = useAuthActions(),
    task = useAuthTask(),
    router = useRouter();
  const [review, setReview] = useState<boolean | null>(null),
    [name, setName] = useState(data.account.name),
    [draft, setDraft] = useState<OnboardingJobDraft>({
      name: "",
      title: "",
      rate: "",
      currency: data.preferences.currency,
    });
  useEffect(() => {
    setReview(
      new URLSearchParams(window.location.search).get("review") === "1",
    );
  }, []);
  useEffect(() => {
    if (review === false && data.auth.onboarding.complete)
      router.replace(entryDestination(data));
  }, [review, data.auth.onboarding.complete, router]);
  const existing = data.jobs.filter((job) => !job.archived),
    reusable = canReuseStarter(data),
    limited = !reusable && existing.length >= entitlementsFor(data).jobLimit,
    saved = data.jobs.find(
      (job) => job.id === data.auth.onboarding.lastSavedJobId,
    ),
    step = data.auth.onboarding.step;
  const update = (changes: Partial<OnboardingJobDraft>) => {
    setDraft((value) => ({ ...value, ...changes }));
    task.setError("");
  };
  const finish = () =>
    void task.run(() => actions.finish(name, review === true));
  const premium = () =>
    router.push(
      `/plans?returnTo=${encodeURIComponent(review ? "/onboarding?review=1" : "onboarding")}`,
    );
  if (review == null || (data.auth.onboarding.complete && !review))
    return (
      <main className="loading">
        <p>Opening setup…</p>
      </main>
    );
  return (
    <AuthLayout>
      <div
        className="onboarding-progress"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={2}
        aria-valuenow={step}
      >
        <span style={{ width: step === 1 ? "50%" : "100%" }} />
      </div>
      <p className="eyebrow">
        {review ? "Review setup" : "Welcome"} · Step {step} of 2
      </p>
      {step === 1 ? (
        <form
          className="form-stack"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void task.run(() => actions.name(name));
          }}
        >
          <h2>What should we call you?</h2>
          <p>Just your name to personalise the app.</p>
          <Field
            label="Your name"
            autoComplete="name"
            value={name}
            disabled={task.busy}
            onChange={(event) => {
              setName(event.target.value);
              task.setError("");
            }}
          />
          <button className="primary" disabled={task.busy || !name.trim()}>
            {task.busy ? "Saving…" : "Next — set up your first job"}
          </button>
          <button type="button" disabled={task.busy} onClick={finish}>
            Skip for now — go straight to the app
          </button>
        </form>
      ) : (
        <div className="form-stack">
          <h2>
            {saved
              ? "Your job is ready"
              : existing.length && !reusable
                ? "Your work profiles"
                : "Where do you work?"}
          </h2>
          <p>
            Set your job, rate and currency. Existing work is kept in this
            browser; nothing is uploaded.
          </p>
          {!reusable && existing.length > 0 && (
            <div className="onboarding-existing">
              <h3>Existing jobs retained</h3>
              <ul>
                {existing.map((job) => (
                  <li key={job.id}>
                    <strong>{job.name}</strong>
                    <span>
                      {data.payVisible
                        ? money(
                            job.hourlyRate,
                            job.currency ?? data.preferences.currency,
                          )
                        : "•••••"}{" "}
                      / hr
                    </span>
                  </li>
                ))}
              </ul>
              <button disabled={task.busy} onClick={finish}>
                Keep existing jobs & continue
              </button>
            </div>
          )}
          {saved ? (
            <>
              <div className="auth-message" role="status">
                “{saved.name}” saved in this browser.
              </div>
              <button
                disabled={task.busy}
                onClick={() =>
                  limited
                    ? premium()
                    : void task.run(async () => {
                        await actions.another();
                        setDraft({
                          name: "",
                          title: "",
                          rate: "",
                          currency: data.preferences.currency,
                        });
                      })
                }
              >
                {limited ? "Add another job · Premium" : "+ Add another job"}
              </button>
              <button className="primary" disabled={task.busy} onClick={finish}>
                Continue to app
              </button>
            </>
          ) : limited ? (
            <>
              <p>
                Free already has its job profile. Keep it, or preview Premium to
                add more.
              </p>
              <button disabled={task.busy} onClick={premium}>
                Preview Premium for more jobs
              </button>
            </>
          ) : (
            <form
              className="form-stack"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void task.run(() => actions.job(draft));
              }}
            >
              {reusable && (
                <p className="auth-message">
                  Saving replaces only the unused starter profile. It will not
                  create a second Free job.
                </p>
              )}
              <Field
                label="Company / job name"
                value={draft.name}
                disabled={task.busy}
                onChange={(event) => update({ name: event.target.value })}
              />
              <Field
                label="Role / title (optional)"
                value={draft.title}
                disabled={task.busy}
                onChange={(event) => update({ title: event.target.value })}
              />
              <Field
                label="Base pay rate / hr (optional)"
                type="number"
                step="any"
                value={draft.rate}
                disabled={task.busy}
                onChange={(event) => update({ rate: event.target.value })}
              />
              <p>
                Blank inherits the saved global rate
                {data.payVisible
                  ? ` of ${money(data.defaultPlan.hourlyRate, draft.currency)} / hr`
                  : ""}
                .
              </p>
              <label className="field">
                <span>Currency</span>
                <select
                  value={draft.currency}
                  disabled={task.busy}
                  onChange={(event) => update({ currency: event.target.value })}
                >
                  {currencies.map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </label>
              <button
                className="primary"
                disabled={task.busy || !draft.name.trim()}
              >
                {task.busy ? "Saving…" : "Save this job"}
              </button>
            </form>
          )}
          <button
            disabled={task.busy}
            onClick={() => void task.run(actions.back)}
          >
            ← Back
          </button>
          {!saved && (
            <button disabled={task.busy} onClick={finish}>
              Skip — go to app
            </button>
          )}
        </div>
      )}
      <AuthError message={task.error} />
      <p className="auth-footnote">
        Update your name in Settings and your work profiles in Jobs.
      </p>
    </AuthLayout>
  );
}
