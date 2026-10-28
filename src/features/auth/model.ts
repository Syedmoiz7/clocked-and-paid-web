import type {
  AppState,
  MockAccount,
  MockAuthFlow,
  MockAuthState,
  MockJob,
} from "../../types";
import { newJob, validateJob } from "../jobs/model";
import { entitlementsFor } from "../../services/entitlements";

export function authDefaults(): MockAuthState {
  return {
    session: "signed-out",
    lastProfile: null,
    pending: null,
    onboarding: {
      complete: false,
      step: 1,
      createdJobIds: [],
      lastSavedJobId: null,
    },
    guestConversionAt: null,
  };
}
export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
export function hasWorkspaceData(
  data: Pick<
    AppState,
    | "history"
    | "jobs"
    | "activeShift"
    | "extraShifts"
    | "orphanedShift"
    | "deductions"
    | "paychecks"
  >,
) {
  return Boolean(
    data.history.length ||
    data.activeShift ||
    data.extraShifts.length ||
    data.orphanedShift ||
    data.deductions.length ||
    data.paychecks.length ||
    data.jobs.some(
      (job) =>
        job.id !== "default" ||
        job.name !== "Default job" ||
        job.hourlyRate !== 24 ||
        job.currency ||
        job.reminderSettings ||
        job.archived ||
        job.createdAt,
    ),
  );
}
export function migrateAuth(saved: Partial<AppState>): MockAuthState {
  const base = authDefaults();
  if (saved.auth) {
    const value = saved.auth,
      profile = value.lastProfile,
      flow = value.pending;
    const session =
      ["guest", "mock", "signed-out"].includes(value.session) &&
      (value.session !== "mock" ||
        (saved.account?.mode === "mock" &&
          typeof saved.account.email === "string" &&
          saved.account.email.trim()))
        ? value.session
        : "signed-out";
    return {
      session,
      lastProfile:
        profile &&
        typeof profile.email === "string" &&
        typeof profile.name === "string"
          ? { name: profile.name, email: profile.email }
          : null,
      pending:
        flow &&
        typeof flow.id === "string" &&
        flow.id &&
        ["confirmation", "recovery"].includes(flow.kind) &&
        typeof flow.email === "string" &&
        typeof flow.name === "string" &&
        Number.isFinite(flow.createdAt)
          ? {
              id: flow.id,
              kind: flow.kind,
              email: flow.email,
              name: flow.name,
              createdAt: flow.createdAt,
              ...(flow.kind === "confirmation" &&
              (flow.plan === "free" || flow.plan === "premium")
                ? { plan: flow.plan }
                : {}),
            }
          : null,
      onboarding: {
        complete: value.onboarding?.complete === true,
        step: value.onboarding?.step === 2 ? 2 : 1,
        createdJobIds: Array.isArray(value.onboarding?.createdJobIds)
          ? [
              ...new Set(
                value.onboarding.createdJobIds.filter(
                  (id) => typeof id === "string",
                ),
              ),
            ]
          : [],
        lastSavedJobId:
          typeof value.onboarding?.lastSavedJobId === "string"
            ? value.onboarding.lastSavedJobId
            : null,
      },
      guestConversionAt:
        typeof value.guestConversionAt === "string"
          ? value.guestConversionAt
          : null,
    };
  }
  if (saved.account?.mode === "mock")
    return {
      ...base,
      session: "mock",
      lastProfile: { name: saved.account.name, email: saved.account.email },
      onboarding: { ...base.onboarding, complete: true },
    };
  const used = hasWorkspaceData({
    history: saved.history ?? [],
    activeShift: saved.activeShift ?? null,
    extraShifts: saved.extraShifts ?? [],
    orphanedShift: saved.orphanedShift ?? null,
    deductions: saved.deductions ?? [],
    paychecks: saved.paychecks ?? [],
    jobs: saved.jobs ?? [],
  });
  return { ...base, session: used ? "guest" : "signed-out" };
}
export type EntryDestination = "/auth" | "/onboarding" | "/tracker";
export function entryDestination(
  data: Pick<AppState, "auth">,
): EntryDestination {
  return data.auth.session === "signed-out"
    ? "/auth"
    : data.auth.session === "mock" && !data.auth.onboarding.complete
      ? "/onboarding"
      : "/tracker";
}
export type Credentials = {
  email: string;
  password: string;
  name?: string;
  confirmation?: string;
};
export function validateCredentials(
  value: Credentials,
  signup = false,
): string | null {
  if (!value.email.trim() || !value.password.trim())
    return "Use any non-empty mock email and password.";
  if (signup && !value.name?.trim()) return "Enter your name.";
  if (signup && value.password !== value.confirmation)
    return "Passwords don't match.";
  return null;
}
export function mockAccount(email: string, name = ""): MockAccount {
  const normalized = normalizeEmail(email);
  return {
    mode: "mock",
    email: normalized,
    name: name.trim() || normalized.split("@")[0] || "Mock user",
  };
}
export function validDemoFlow(
  pending: MockAuthFlow | null,
  params: { demo?: string; flow?: string; id?: string },
  now = Date.now(),
) {
  return Boolean(
    pending &&
    params.demo === "1" &&
    params.flow === pending.kind &&
    params.id === pending.id &&
    now >= pending.createdAt &&
    now - pending.createdAt <= 30 * 60000,
  );
}
export function canReuseStarter(data: AppState) {
  const job = data.jobs[0];
  return (
    data.jobs.length === 1 &&
    !hasWorkspaceData(data) &&
    job?.id === "default" &&
    job.name === "Default job" &&
    job.hourlyRate === 24 &&
    job.color === "#d65c90" &&
    !job.archived &&
    !job.createdAt &&
    !job.currency &&
    !job.reminderSettings &&
    !job.title &&
    !job.notes &&
    job.overtimeThreshold == null &&
    job.overtimeMultiplier == null &&
    job.lunchMinutes == null &&
    job.lunchEnabled == null &&
    job.enableTips == null &&
    !job.payFrequency &&
    !job.nextPayDate &&
    !Object.keys(data.paySchedules).length
  );
}
export type OnboardingJobDraft = {
  name: string;
  title: string;
  rate: string;
  currency: string;
};
export function prepareOnboardingJob(
  data: AppState,
  draft: OnboardingJobDraft,
  proposedId: string,
): { job: MockJob } | { error: string } {
  const reuse = canReuseStarter(data);
  if (
    !reuse &&
    data.jobs.filter((job) => !job.archived).length >=
      entitlementsFor(data).jobLimit
  )
    return {
      error:
        "Your Free profile is already set up. Keep it and continue, or preview Premium to add another job.",
    };
  const job = {
    ...newJob(
      reuse ? "default" : proposedId,
      draft.rate.trim() ? Number(draft.rate) : data.defaultPlan.hourlyRate,
    ),
    name: draft.name.trim(),
    title: draft.title.trim(),
    currency: draft.currency,
    isDefault: reuse || !data.jobs.some((job) => !job.archived),
    lunchMinutes: data.defaultPlan.lunchMinutes,
    lunchEnabled: data.defaultPlan.lunchEnabled,
    reminderSettings: undefined,
  };
  const error = validateJob(job);
  return error ? { error } : { job };
}
export const planReturnPaths = [
  "/tracker",
  "/history",
  "/pay",
  "/jobs",
  "/settings",
  "/onboarding",
  "/onboarding?review=1",
] as const;
export function safePlanReturn(
  value: unknown,
): (typeof planReturnPaths)[number] {
  return typeof value === "string" && planReturnPaths.includes(value as any)
    ? (value as (typeof planReturnPaths)[number])
    : "/settings";
}
