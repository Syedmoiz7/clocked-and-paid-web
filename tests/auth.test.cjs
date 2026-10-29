const fs = require("node:fs"),
  ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
const test = require("node:test"),
  assert = require("node:assert/strict");
const model = require("../src/features/auth/model.ts");
const actions = require("../src/store/appSlice.ts");
const { appReducer: reduce, initialAppState: initial } = actions;
const backup = require("../src/features/settings/backup.ts");
const { entitlementsFor } = require("../src/services/entitlements.ts");
const signedIn = () =>
  reduce(
    initial,
    actions.enterMockSession(model.mockAccount("demo@example.com", "Demo")),
  );
const flow = (kind = "confirmation", id = "nonce") => ({
  kind,
  id,
  email: " Demo@Example.com ",
  name: " Demo ",
  createdAt: 1000,
});
const jobDraft = { name: "Acme", title: "Engineer", rate: "", currency: "USD" };
const used = () => ({
  ...initial,
  jobs: [{ ...initial.jobs[0], name: "My real job" }],
  history: [
    {
      id: "old",
      date: "2026-10-01",
      startedAt: "2026-10-01T09:00:00",
      endedAt: "2026-10-01T17:00:00",
      jobId: "default",
      lunchMinutes: 30,
      breakMinutes: 0,
      earnings: 180,
      currency: "USD",
    },
  ],
});

test("fresh workspace starts at auth; guest can enter tracker immediately", () => {
  assert.equal(model.entryDestination(initial), "/auth");
  const guest = reduce(initial, actions.enterGuest());
  assert.equal(model.entryDestination(guest), "/tracker");
  assert.equal(guest.account.mode, "guest");
});
test("new mock identity enters onboarding until finish or skip", () => {
  const data = signedIn();
  assert.equal(model.entryDestination(data), "/onboarding");
  const finished = reduce(data, actions.finishOnboarding(""));
  assert.equal(model.entryDestination(finished), "/tracker");
  assert.equal(finished.account.name, "Demo");
});
test("approved mock credentials accept short passwords and non-empty mock email values", () => {
  assert.equal(
    model.validateCredentials({ email: "mock", password: "x" }),
    null,
  );
  assert.ok(model.validateCredentials({ email: " ", password: "x" }));
  assert.ok(model.validateCredentials({ email: "mock", password: " " }));
});
test("signup requires name and matching confirmation without production password rules", () => {
  assert.equal(
    model.validateCredentials(
      { email: "mock", password: "x", name: "A", confirmation: "x" },
      true,
    ),
    null,
  );
  assert.ok(
    model.validateCredentials(
      { email: "mock", password: "x", name: "", confirmation: "x" },
      true,
    ),
  );
  assert.ok(
    model.validateCredentials(
      { email: "mock", password: "x", name: "A", confirmation: "y" },
      true,
    ),
  );
});
test("legacy mock sessions retain profile and do not force new onboarding", () => {
  const auth = model.migrateAuth({
    account: model.mockAccount("DEMO@Example.com", "Demo"),
  });
  assert.equal(auth.session, "mock");
  assert.equal(auth.onboarding.complete, true);
  assert.equal(auth.lastProfile.email, "demo@example.com");
});
test("legacy used guest workspace resumes; unused starter still gets entry screen", () => {
  const { auth: oldAuth, ...legacyUsed } = used();
  assert.equal(model.migrateAuth(legacyUsed).session, "guest");
  const { auth, ...legacy } = initial;
  assert.equal(model.migrateAuth(legacy).session, "signed-out");
  assert.equal(
    model.migrateAuth({
      ...legacy,
      jobs: [{ ...legacy.jobs[0], hourlyRate: 30 }],
    }).session,
    "guest",
  );
});
test("hydration normalizes auth metadata and strips unrecognized credential fields", () => {
  const data = reduce(
    initial,
    actions.hydrate({
      ...signedIn(),
      account: { ...signedIn().account, password: "SECRET" },
      auth: {
        ...signedIn().auth,
        password: "SECRET",
        lastProfile: { email: "demo", name: "Demo", token: "SECRET" },
        pending: { ...flow(), password: "SECRET" },
        onboarding: {
          step: 9,
          complete: false,
          createdJobIds: ["a", "a", 3],
          lastSavedJobId: null,
        },
      },
    }),
  );
  assert.equal(JSON.stringify(data).includes("SECRET"), false);
  assert.equal(data.auth.onboarding.step, 1);
  assert.deepEqual(data.auth.onboarding.createdJobIds, ["a"]);
});
test("inconsistent restored mock session falls back to signed out", () => {
  assert.equal(
    model.migrateAuth({
      account: initial.account,
      auth: { ...model.authDefaults(), session: "mock" },
    }).session,
    "signed-out",
  );
});
test("mock callback requires exact nonce, kind, explicit demo flag and unexpired time", () => {
  const pending = flow(),
    params = { demo: "1", flow: "confirmation", id: "nonce" };
  assert.equal(model.validDemoFlow(pending, params, 1000), true);
  assert.equal(model.validDemoFlow(pending, params, 1801000), true);
  for (const change of [
    { id: "wrong" },
    { flow: "recovery" },
    { demo: undefined },
    { id: ["nonce"] },
  ])
    assert.equal(
      model.validDemoFlow(pending, { ...params, ...change }, 1001),
      false,
    );
  assert.equal(model.validDemoFlow(pending, params, 999), false);
  assert.equal(model.validDemoFlow(pending, params, 1801001), false);
});
test("preparing confirmation only stores metadata; completion consumes it once", () => {
  let data = reduce(
    initial,
    actions.prepareMockFlow({ ...flow(), password: "SECRET" }),
  );
  assert.equal(data.auth.session, "signed-out");
  assert.equal(JSON.stringify(data).includes("SECRET"), false);
  data = reduce(
    data,
    actions.completeMockConfirmation({ id: "nonce", now: 1001 }),
  );
  assert.equal(data.auth.session, "mock");
  assert.equal(data.auth.pending, null);
  assert.equal(data.account.name, "Demo");
  assert.deepEqual(
    reduce(data, actions.completeMockConfirmation({ id: "nonce", now: 1002 })),
    data,
  );
});
test("resend invalidates previous callback and cancellation invalidates current callback", () => {
  let data = reduce(initial, actions.prepareMockFlow(flow()));
  data = reduce(data, actions.prepareMockFlow(flow("confirmation", "fresh")));
  assert.deepEqual(
    reduce(data, actions.completeMockConfirmation({ id: "nonce", now: 1001 })),
    data,
  );
  data = reduce(data, actions.clearMockFlow());
  assert.deepEqual(
    reduce(data, actions.completeMockConfirmation({ id: "fresh", now: 1001 })),
    data,
  );
});
test("expired confirmation cannot create mock session", () => {
  const data = reduce(initial, actions.prepareMockFlow(flow()));
  assert.deepEqual(
    reduce(
      data,
      actions.completeMockConfirmation({ id: "nonce", now: 2000000 }),
    ),
    data,
  );
});
test("signup plan choice takes effect only after valid confirmation", () => {
  for (const plan of ["free", "premium"]) {
    const before = { ...initial, isPremium: plan === "free" };
    const prepared = reduce(
      before,
      actions.prepareMockFlow({ ...flow(), plan }),
    );
    assert.equal(prepared.isPremium, before.isPremium);
    assert.equal(prepared.auth.pending.plan, plan);
    const confirmed = reduce(
      prepared,
      actions.completeMockConfirmation({ id: "nonce", now: 1001 }),
    );
    assert.equal(confirmed.isPremium, plan === "premium");
    assert.equal(model.entryDestination(confirmed), "/onboarding");
    assert.deepEqual(confirmed.history, before.history);
    assert.deepEqual(confirmed.jobs, before.jobs);
  }
});
test("cancelled or expired signup cannot activate Premium", () => {
  const prepared = reduce(
    { ...initial, isPremium: false },
    actions.prepareMockFlow({ ...flow(), plan: "premium" }),
  );
  assert.equal(reduce(prepared, actions.clearMockFlow()).isPremium, false);
  assert.equal(
    reduce(
      prepared,
      actions.completeMockConfirmation({ id: "nonce", now: 2000000 }),
    ).isPremium,
    false,
  );
});
test("signup plan survives restart migration and resending confirmation", () => {
  let data = reduce(
    initial,
    actions.prepareMockFlow({ ...flow(), plan: "premium" }),
  );
  const migrated = model.migrateAuth(data);
  assert.equal(migrated.pending.plan, "premium");
  data = reduce(
    data,
    actions.prepareMockFlow({ ...migrated.pending, id: "resent" }),
  );
  data = reduce(
    data,
    actions.completeMockConfirmation({ id: "resent", now: 1001 }),
  );
  assert.equal(data.isPremium, true);
});
test("legacy confirmation keeps current plan and recovery ignores plan metadata", () => {
  const before = { ...initial, isPremium: true };
  const legacy = reduce(before, actions.prepareMockFlow(flow()));
  assert.equal(
    reduce(legacy, actions.completeMockConfirmation({ id: "nonce", now: 1001 }))
      .isPremium,
    true,
  );
  const recovery = reduce(
    before,
    actions.prepareMockFlow({ ...flow("recovery"), plan: "free" }),
  );
  assert.equal(recovery.auth.pending.plan, undefined);
  assert.equal(
    reduce(recovery, actions.completeMockRecovery({ id: "nonce", now: 1001 }))
      .isPremium,
    true,
  );
});
test("unsupported signup plan values are not persisted or applied", () => {
  const data = reduce(
    { ...initial, isPremium: false },
    actions.prepareMockFlow({ ...flow(), plan: "third-tier" }),
  );
  assert.equal(data.auth.pending.plan, undefined);
  assert.equal(
    model.migrateAuth({
      ...data,
      auth: { ...data.auth, pending: { ...flow(), plan: "third-tier" } },
    }).pending.plan,
    undefined,
  );
  assert.equal(
    reduce(data, actions.completeMockConfirmation({ id: "nonce", now: 1001 }))
      .isPremium,
    false,
  );
});
test("recovery callback cannot be used as confirmation and does not sign in", () => {
  let data = reduce(initial, actions.prepareMockFlow(flow("recovery")));
  assert.deepEqual(
    reduce(data, actions.completeMockConfirmation({ id: "nonce", now: 1001 })),
    data,
  );
  data = reduce(data, actions.completeMockRecovery({ id: "nonce", now: 1001 }));
  assert.equal(data.auth.pending, null);
  assert.equal(data.auth.session, "signed-out");
});
test("guest conversion and signout preserve jobs, history, live shifts, pay, settings and entitlements", () => {
  const workspace = {
    ...used(),
    auth: { ...model.authDefaults(), session: "guest" },
    activeShift: { ...used().history[0], id: "running", endedAt: undefined },
    isPremium: true,
  };
  let data = reduce(
    workspace,
    actions.enterMockSession(model.mockAccount("demo", "Demo")),
  );
  assert.ok(data.auth.guestConversionAt);
  for (const key of [
    "jobs",
    "history",
    "activeShift",
    "extraShifts",
    "paychecks",
    "paySchedules",
    "deductions",
    "preferences",
    "defaultPlan",
    "isPremium",
  ])
    assert.deepEqual(data[key], workspace[key], key);
  data = reduce(data, actions.signOutMockSession());
  assert.equal(model.entryDestination(data), "/auth");
  assert.equal(data.auth.lastProfile.name, "Demo");
  assert.deepEqual(data.history, workspace.history);
  assert.deepEqual(data.activeShift, workspace.activeShift);
});
test("returning same identity resumes onboarding state; another identity starts setup", () => {
  let data = reduce(signedIn(), actions.finishOnboarding("Chosen name"));
  data = reduce(data, actions.signOutMockSession());
  data = reduce(
    data,
    actions.enterMockSession(model.mockAccount("DEMO@example.com", "")),
  );
  assert.equal(data.auth.onboarding.complete, true);
  data = reduce(
    data,
    actions.enterMockSession(model.mockAccount("other", "Other")),
  );
  assert.equal(data.auth.onboarding.complete, false);
});
test("guest mode retains remembered profile without signing in", () => {
  const data = reduce(signedIn(), actions.enterGuest());
  assert.equal(data.auth.session, "guest");
  assert.equal(data.auth.lastProfile.name, "Demo");
  assert.equal(data.account.email, "");
});
test("name step is trimmed and onboarding can go back without creating work", () => {
  let data = reduce(signedIn(), actions.advanceOnboarding("  Chosen  "));
  assert.equal(data.account.name, "Chosen");
  assert.equal(data.auth.onboarding.step, 2);
  data = reduce(data, actions.backOnboarding());
  assert.equal(data.auth.onboarding.step, 1);
  assert.deepEqual(data.jobs, initial.jobs);
});
test("unused starter is reused with global default rate and chosen currency", () => {
  const before = {
    ...signedIn(),
    defaultPlan: { ...initial.defaultPlan, hourlyRate: 32 },
  };
  const data = reduce(
    before,
    actions.saveOnboardingJob({
      draft: { ...jobDraft, currency: "EUR" },
      id: "new",
    }),
  );
  assert.equal(data.jobs.length, 1);
  assert.equal(data.jobs[0].id, "default");
  assert.equal(data.jobs[0].name, "Acme");
  assert.equal(data.jobs[0].hourlyRate, 32);
  assert.equal(data.jobs[0].currency, "EUR");
  assert.equal(data.jobs[0].isDefault, true);
});
test("existing history, running work, schedules or custom profile prevent starter overwrite", () => {
  for (const changes of [
    { history: used().history },
    { activeShift: used().history[0] },
    { jobs: used().jobs },
    { paySchedules: { default: {} } },
    { jobs: [{ ...initial.jobs[0], color: "#123456" }] },
    { jobs: [{ ...initial.jobs[0], lunchMinutes: 45 }] },
  ]) {
    const data = { ...signedIn(), ...changes };
    assert.equal(model.canReuseStarter(data), false);
    assert.ok("error" in model.prepareOnboardingJob(data, jobDraft, "new"));
  }
});
test("premium setup appends new job without modifying live work or previous profiles", () => {
  const before = {
    ...used(),
    auth: signedIn().auth,
    account: signedIn().account,
    isPremium: true,
    activeShift: used().history[0],
  };
  const data = reduce(
    before,
    actions.saveOnboardingJob({ draft: jobDraft, id: "new" }),
  );
  assert.equal(data.jobs.length, 2);
  assert.deepEqual(data.jobs[0], before.jobs[0]);
  assert.deepEqual(data.activeShift, before.activeShift);
  assert.deepEqual(data.history, before.history);
});
test("save lock prevents duplicate jobs until explicit add-another; duplicate ID rejected", () => {
  let data = { ...signedIn(), isPremium: true };
  data = reduce(
    data,
    actions.saveOnboardingJob({ draft: jobDraft, id: "first" }),
  );
  const saved = data;
  assert.deepEqual(
    reduce(data, actions.saveOnboardingJob({ draft: jobDraft, id: "second" })),
    saved,
  );
  data = reduce(data, actions.clearOnboardingSuccess());
  assert.deepEqual(
    reduce(data, actions.saveOnboardingJob({ draft: jobDraft, id: "default" })),
    data,
  );
  data = reduce(
    data,
    actions.saveOnboardingJob({ draft: jobDraft, id: "second" }),
  );
  assert.equal(data.jobs.length, 2);
});
test("invalid job rates and blank company name cannot mutate workspace", () => {
  for (const draft of [
    { ...jobDraft, rate: "-2" },
    { ...jobDraft, rate: "abc" },
    { ...jobDraft, name: " " },
  ])
    assert.deepEqual(
      reduce(signedIn(), actions.saveOnboardingJob({ draft, id: "new" })),
      signedIn(),
    );
});
test("guest cannot run onboarding mutations for mock profile", () => {
  assert.deepEqual(
    reduce(initial, actions.saveOnboardingJob({ draft: jobDraft, id: "new" })),
    initial,
  );
  assert.deepEqual(reduce(initial, actions.advanceOnboarding("Name")), initial);
  assert.deepEqual(reduce(initial, actions.finishOnboarding("Name")), initial);
});
test("hydration resumes setup step and saved-job success without duplication", () => {
  let data = reduce(signedIn(), actions.advanceOnboarding("Demo"));
  data = reduce(
    data,
    actions.saveOnboardingJob({ draft: jobDraft, id: "new" }),
  );
  const restored = reduce(
    initial,
    actions.hydrate(JSON.parse(JSON.stringify(data))),
  );
  assert.equal(restored.auth.onboarding.step, 2);
  assert.equal(restored.auth.onboarding.lastSavedJobId, "default");
  assert.deepEqual(restored.jobs, JSON.parse(JSON.stringify(data.jobs)));
});
test("local reset preserves session and finished setup but clears pending flows and saved-job bookkeeping", () => {
  let data = reduce(signedIn(), actions.finishOnboarding("Demo"));
  data = reduce(data, actions.prepareMockFlow(flow("recovery")));
  const reset = actions.resetWorkspaceState(data);
  assert.equal(reset.auth.session, "mock");
  assert.equal(reset.auth.onboarding.complete, true);
  assert.equal(reset.auth.pending, null);
  assert.deepEqual(reset.auth.onboarding.createdJobIds, []);
  assert.deepEqual(reset.account, data.account);
});
test("backup omits session/identity/entitlements; injected auth cannot change session on import", () => {
  const data = signedIn(),
    text = backup.backupText(data),
    payload = JSON.parse(text);
  for (const key of ["auth", "account", "isPremium"])
    assert.equal(key in payload, false);
  const imported = backup.parseBackup(
    JSON.stringify({
      ...payload,
      auth: { session: "mock" },
      account: model.mockAccount("injected"),
      isPremium: true,
    }),
    "backup.json",
    initial,
  );
  const result = backup.applyImport(initial, imported, "merge", true);
  assert.deepEqual(result.auth, initial.auth);
  assert.deepEqual(result.account, initial.account);
  assert.equal(result.isPremium, false);
});
test("all premium capabilities share one entitlement adapter and downgrade preserves business records", () => {
  const free = entitlementsFor(initial),
    premium = entitlementsFor({ isPremium: true });
  for (const key of [
    "calculator",
    "fullHistory",
    "advancedPay",
    "deductionsManager",
    "backupRestore",
    "recoveryTools",
    "fullThemePalette",
    "adsRemoved",
  ]) {
    assert.equal(free[key], false);
    assert.equal(premium[key], true);
  }
  const before = { ...used(), isPremium: true, activeShift: used().history[0] };
  const after = reduce(before, actions.setPremiumPreview(false));
  assert.deepEqual(after.jobs, before.jobs);
  assert.deepEqual(after.history, before.history);
  assert.deepEqual(after.activeShift, before.activeShift);
});
test("Plans fallback destinations reject external, unknown and array paths", () => {
  for (const path of model.planReturnPaths)
    assert.equal(model.safePlanReturn(path), path);
  for (const value of [
    "https://example.com",
    "//external",
    "/auth-callback",
    ["/tracker"],
    undefined,
  ])
    assert.equal(model.safePlanReturn(value), "/settings");
});
