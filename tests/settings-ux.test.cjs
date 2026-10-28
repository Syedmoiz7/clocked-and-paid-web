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
const model = require("../src/features/settings/model.ts");
const drafts = require("../src/features/settings/drafts.ts");
const backup = require("../src/features/settings/backup.ts");
const { recoveryImport } = require("../src/features/settings/recovery.ts");
const { importImpact } = require("../src/features/settings/importImpact.ts");
const {
  parseLockRecord,
  PrivacyAttemptGate,
  privacyOperations,
} = require("../src/features/settings/privacyLogic.ts");
const history = require("../src/features/history/model.ts");
const pay = require("../src/features/pay/model.ts");
const store = require("../src/store/appSlice.ts");
const { commitWorkspaceAction } = require("../src/services/commitWorkspace.ts");
const { appReducer: reduce, initialAppState: initial } = store;
const state = (changes) => ({
  ...initial,
  history: [],
  deductions: [],
  paychecks: [],
  ...changes,
});
const entry = (changes) => ({
  id: "work",
  date: "2026-10-20",
  startedAt: "2026-10-20T09:00:00",
  endedAt: "2026-10-20T21:00:00",
  lunchMinutes: 0,
  breakMinutes: 0,
  earnings: 0,
  ...changes,
});
const imported = (changes) => ({
  format: "mobile",
  history: [],
  warnings: [],
  ...changes,
});
const prefs = (data, changes) => ({
  ...model.settingsDraft(data),
  preferences: { ...data.preferences, ...changes },
});
const lock = (changes) => ({
  type: "pin4",
  salt: "device-salt",
  hash: "a".repeat(64),
  biometrics: false,
  failures: 0,
  blockedUntil: 0,
  ...changes,
});

test("Settings drafts rebase untouched defaults while preserving edited preference leaves", () => {
  const data = state(),
    base = model.settingsDraft(data);
  const local = prefs(data, { clockFormat: "24h" });
  const latest = { ...base, plan: { ...base.plan, plannedHours: 10 } };
  const result = drafts.rebaseSettingsDraft(local, base, latest);
  assert.equal(result.preferences.clockFormat, "24h");
  assert.equal(result.plan.plannedHours, 10);
});
test("nested reminder rebasing preserves independent edits instead of replacing the entire object", () => {
  const data = state(),
    base = model.settingsDraft(data);
  const local = prefs(data, {
    defaultReminders: { ...data.preferences.defaultReminders, sound: false },
  });
  const latest = {
    ...base,
    preferences: {
      ...base.preferences,
      defaultReminders: {
        ...base.preferences.defaultReminders,
        repeatMinutes: 15,
      },
    },
  };
  const result = drafts.rebaseSettingsDraft(local, base, latest);
  assert.equal(result.preferences.defaultReminders.sound, false);
  assert.equal(result.preferences.defaultReminders.repeatMinutes, 15);
});
test("buffered Settings saves use latest automatic theme and untouched defaults", () => {
  const data = state(),
    base = model.settingsDraft(data);
  const latest = state({
    preferences: { ...data.preferences, themeHue: 220 },
    defaultPlan: { ...data.defaultPlan, plannedHours: 12 },
  });
  const prepared = drafts.prepareSettingsSave(
    latest,
    prefs(data, { clockFormat: "24h" }),
    base,
  );
  assert.equal(prepared.error, null);
  assert.equal(prepared.draft.preferences.themeHue, 220);
  assert.equal(prepared.draft.plan.plannedHours, 12);
});
test("draft equality distinguishes nonfinite invalid input and incompatible collection shapes", () => {
  assert.equal(drafts.sameValue({ a: NaN }, { a: null }), false);
  assert.equal(drafts.sameValue([1], { 0: 1 }), false);
  assert.equal(drafts.sameValue({ a: [1, 2] }, { a: [1, 2] }), true);
});
test("inactive lunch/reminder inputs are normalized without persisting nonfinite values", () => {
  const data = state(),
    base = model.settingsDraft(data);
  const local = {
    ...base,
    plan: { ...base.plan, lunchEnabled: false, lunchMinutes: NaN },
    preferences: {
      ...base.preferences,
      defaultReminders: {
        ...base.preferences.defaultReminders,
        lunchMode: "off",
        lunchHours: NaN,
        overlay: false,
        snoozeMinutes: NaN,
      },
    },
  };
  const prepared = drafts.prepareSettingsSave(data, local, base);
  assert.equal(prepared.error, null);
  assert.equal(prepared.draft.plan.lunchMinutes, 30);
  assert.equal(
    Number.isFinite(prepared.draft.preferences.defaultReminders.lunchHours),
    true,
  );
  assert.equal(
    Number.isFinite(prepared.draft.preferences.defaultReminders.snoozeMinutes),
    true,
  );
});
test("active invalid reminder inputs still fail without changing the saved source", () => {
  const data = state(),
    base = model.settingsDraft(data);
  const local = prefs(data, {
    defaultReminders: {
      ...data.preferences.defaultReminders,
      lunchMode: "relative",
      lunchHours: NaN,
    },
  });
  assert.ok(drafts.prepareSettingsSave(data, local, base).error);
  assert.equal(data.preferences.defaultReminders.lunchHours, 5);
});
test("disabled zero lunch is retained while an out-of-range inactive reminder offset is normalized", () => {
  const data = state(),
    base = model.settingsDraft(data);
  const local = {
    ...base,
    plan: { ...base.plan, lunchEnabled: false, lunchMinutes: 0 },
    preferences: {
      ...base.preferences,
      defaultReminders: {
        ...base.preferences.defaultReminders,
        lunchMode: "off",
        lunchHours: -20,
      },
    },
  };
  const prepared = drafts.prepareSettingsSave(data, local, base);
  assert.equal(prepared.error, null);
  assert.equal(prepared.draft.plan.lunchMinutes, 0);
  assert.equal(prepared.draft.preferences.defaultReminders.lunchHours, 5);
});
test("unrelated preference saves preserve Today Plan hours, rate and lunch overrides", () => {
  const data = state({
    todayPlan: {
      ...initial.todayPlan,
      plannedHours: 4,
      hourlyRate: 99,
      lunchMinutes: 45,
    },
  });
  const result = reduce(
    data,
    store.saveSettings(prefs(data, { clockFormat: "24h" })),
  );
  assert.deepEqual(result.todayPlan, data.todayPlan);
});
test("new default hours update only a plan still following the old default", () => {
  const data = state({ todayPlan: { ...initial.todayPlan, plannedHours: 4 } });
  const draft = {
    ...model.settingsDraft(data),
    plan: { ...data.defaultPlan, plannedHours: 10 },
  };
  assert.equal(
    reduce(data, store.saveSettings(draft)).todayPlan.plannedHours,
    4,
  );
  const following = state();
  assert.equal(
    reduce(following, store.saveSettings(draft)).todayPlan.plannedHours,
    10,
  );
});
test("additional-only sessions and orphan recovery preserve the in-progress plan during default saves", () => {
  for (const work of [
    { extraShifts: [entry({ endedAt: null })] },
    { orphanedShift: entry({ endedAt: null }) },
  ]) {
    const data = state({
      ...work,
      todayPlan: { ...initial.todayPlan, plannedHours: 7 },
    });
    const draft = {
      ...model.settingsDraft(data),
      plan: { ...data.defaultPlan, plannedHours: 12 },
    };
    assert.equal(
      reduce(data, store.saveSettings(draft)).todayPlan.plannedHours,
      7,
    );
  }
});
test("unrelated preference saves do not reset temporary Tracker reminder switches", () => {
  const data = state({
    reminders: {
      ...initial.reminders,
      lunchReminder: false,
      reminderSound: false,
    },
  });
  const result = reduce(
    data,
    store.saveSettings(prefs(data, { clockFormat: "24h" })),
  );
  assert.deepEqual(result.reminders, data.reminders);
});
test("global repricing freezes unlabeled historical wages and currency", () => {
  const data = state({ history: [entry()] });
  const draft = {
    ...prefs(data, { currency: "EUR" }),
    plan: { ...data.defaultPlan, hourlyRate: 40, overtimeThreshold: 6 },
  };
  const result = reduce(data, store.saveSettings(draft));
  assert.equal(result.history[0].customRate, 24);
  assert.equal(result.history[0].currency, "USD");
  assert.equal(
    history.wagesFor(result.history[0], result.jobs, result.defaultPlan),
    336,
  );
  assert.equal(result.defaultPlan.hourlyRate, 40);
});
test("global fallback changes preserve primary/additional/recoverable monetary snapshots", () => {
  const data = state({
    activeShift: entry({ endedAt: null }),
    extraShifts: [entry({ id: "extra", endedAt: null })],
    orphanedShift: entry({ id: "orphan", endedAt: null }),
    todayPlan: { ...initial.todayPlan, hourlyRate: 33 },
  });
  const draft = {
    ...model.settingsDraft(data),
    plan: { ...data.defaultPlan, hourlyRate: 50 },
  };
  const result = reduce(data, store.saveSettings(draft));
  assert.equal(result.activeShift.customRate, 33);
  assert.equal(result.extraShifts[0].customRate, 24);
  assert.equal(result.orphanedShift.customRate, 24);
  assert.equal(result.activeShift.startedAt, data.activeShift.startedAt);
});
test("global currency changes preserve fixed deduction, receipt and legacy job denomination", () => {
  const data = state({
    deductions: [
      {
        id: "fee",
        label: "Fee",
        amount: 10,
        frequency: "monthly",
        enabled: true,
      },
    ],
    paychecks: [{ id: "receipt", jobId: "default", paid: true }],
  });
  const result = reduce(
    data,
    store.saveSettings(prefs(data, { currency: "EUR" })),
  );
  assert.equal(result.deductions[0].currency, "USD");
  assert.equal(result.paychecks[0].currency, "USD");
  assert.equal(result.jobs[0].currency, "USD");
  assert.equal(
    pay.deductionCurrencyMatches(result.deductions[0], result, "EUR"),
    false,
  );
  assert.equal(
    pay.deductionCurrencyMatches(result.deductions[0], result, "USD"),
    true,
  );
});
test("restored foreign entries and fixed fees keep source prices even when preferences are not restored", () => {
  const data = state();
  const source = imported({
    history: [entry()],
    jobs: [],
    settings: {
      ...model.settingsDraft(data),
      plan: { ...data.defaultPlan, hourlyRate: 50 },
      preferences: { ...data.preferences, currency: "EUR" },
    },
    deductions: [
      {
        id: "fee",
        label: "Fee",
        amount: 10,
        frequency: "monthly",
        enabled: true,
      },
    ],
  });
  const result = backup.applyImport(data, source, "merge", false);
  assert.equal(result.preferences.currency, "USD");
  assert.equal(result.history[0].currency, "EUR");
  assert.equal(result.history[0].customRate, 50);
  assert.equal(result.deductions[0].currency, "EUR");
});
test("restoring changed defaults preserves old current work prices before merging new IDs", () => {
  const data = state({ history: [entry({ id: "old" })] });
  const source = imported({
    settings: {
      ...prefs(data, { currency: "EUR" }),
      plan: { ...data.defaultPlan, hourlyRate: 50 },
    },
  });
  const result = backup.applyImport(data, source, "merge", true);
  assert.equal(result.history[0].currency, "USD");
  assert.equal(result.history[0].customRate, 24);
  assert.equal(result.defaultPlan.hourlyRate, 50);
});
test("merge-only profile imports do not reset a manually edited current plan", () => {
  const data = state({
    todayPlan: { ...initial.todayPlan, plannedHours: 4, lunchMinutes: 45 },
  });
  const result = backup.applyImport(
    data,
    imported({
      jobs: [
        {
          id: "new",
          name: "New",
          hourlyRate: 30,
          currency: "EUR",
          color: "#d65c90",
        },
      ],
    }),
    "merge",
    false,
  );
  assert.deepEqual(result.todayPlan, data.todayPlan);
});
test("replace is blocked while a recoverable session exists", () => {
  assert.throws(
    () =>
      backup.applyImport(
        state({ orphanedShift: entry({ endedAt: null }) }),
        imported(),
        "replace",
        false,
      ),
    /recoverable/,
  );
});
test("import review distinguishes omitted collections from empty replacements and counts changed IDs", () => {
  const data = state({
    history: [entry({ id: "keep" }), entry({ id: "remove" })],
  });
  const source = imported({
    history: [entry({ id: "keep" }), entry({ id: "new" })],
    deductions: [],
  });
  const rows = importImpact(data, source, "replace");
  assert.equal(rows[0].added, 1);
  assert.equal(rows[0].conflicts, 1);
  assert.equal(rows[0].removed, 1);
  assert.equal(rows[1].included, false);
  assert.equal(rows[2].included, true);
});
test("import preview and recovery exclude every current session ID", () => {
  const data = state({
    activeShift: entry({ id: "active", endedAt: null }),
    extraShifts: [entry({ id: "extra", endedAt: null })],
    orphanedShift: entry({ id: "orphan", endedAt: null }),
  });
  const source = imported({
    history: [
      entry({ id: "active" }),
      entry({ id: "extra" }),
      entry({ id: "orphan" }),
      entry({ id: "missing" }),
    ],
  });
  assert.equal(importImpact(data, source, "merge")[0].incoming, 1);
  assert.deepEqual(
    recoveryImport(data, source).history.map((item) => item.id),
    ["missing"],
  );
});
test("recovery adds missing records and only needed archived references, without old financial collections", () => {
  const data = state({ history: [entry({ id: "exists" })] });
  const source = imported({
    history: [
      entry({ id: "exists" }),
      entry({
        id: "missing",
        jobId: "removed",
        paidByPaycheckId: "old-receipt",
      }),
    ],
    jobs: [
      {
        id: "removed",
        name: "Removed",
        hourlyRate: 30,
        currency: "EUR",
        color: "#d65c90",
        isDefault: true,
      },
      { id: "unused", name: "Unused", hourlyRate: 99, color: "#d65c90" },
    ],
    deductions: [],
    paychecks: [],
    paySchedules: {},
    settings: model.settingsDraft(data),
  });
  const result = recoveryImport(data, source);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].customRate, 30);
  assert.equal(result.history[0].currency, "EUR");
  assert.equal(result.history[0].paidByPaycheckId, null);
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].archived, true);
  assert.equal(result.jobs[0].isDefault, false);
  assert.equal(result.settings, undefined);
  assert.equal(result.deductions, undefined);
  assert.equal(result.paychecks, undefined);
  assert.equal(result.paySchedules, undefined);
});
test("recovering old missing history snapshots its old rate even when the current job has changed", () => {
  const data = state({
    jobs: [
      {
        id: "same",
        name: "Same",
        hourlyRate: 99,
        currency: "USD",
        color: "#d65c90",
      },
    ],
  });
  const source = imported({
    history: [entry({ jobId: "same" })],
    jobs: [{ ...data.jobs[0], hourlyRate: 30 }],
  });
  const result = recoveryImport(data, source);
  assert.equal(result.history[0].customRate, 30);
  assert.equal(result.jobs, undefined);
});
test("recovery rechecks missing IDs against current data instead of trusting a stale scan", () => {
  const source = imported({ history: [entry()] });
  assert.equal(recoveryImport(state(), source).history.length, 1);
  assert.equal(
    recoveryImport(state({ history: [entry()] }), source).history.length,
    0,
  );
});
test("reset produces a truly empty workspace while keeping account, auth and entitlement", () => {
  const data = state({
    isPremium: true,
    account: { mode: "mock", name: "Demo", email: "demo@example.com" },
    history: [entry()],
  });
  const result = store.resetWorkspaceState(data);
  assert.deepEqual(result.jobs, []);
  assert.equal(result.selectedJobId, "");
  assert.deepEqual(result.history, []);
  assert.deepEqual(result.account, data.account);
  assert.equal(result.isPremium, true);
});
test("import commit persists the proposed imported workspace before updating visible state", async () => {
  let data = state();
  let written;
  await commitWorkspaceAction(
    store.restoreData({
      imported: imported({ history: [entry()] }),
      mode: "merge",
      includeSettings: false,
    }),
    {
      read: () => data,
      write: async (proposed) => {
        written = proposed;
        assert.equal(data.history.length, 0);
      },
      dispatch: (action) => {
        data = reduce(data, action);
      },
    },
  );
  assert.equal(written.history[0].id, "work");
  assert.equal(data.history[0].id, "work");
});
test("failed import persistence leaves the current workspace and review payload unchanged", async () => {
  let data = state({ history: [entry({ id: "current" })] });
  const before = data;
  const source = imported({ history: [entry({ id: "incoming" })] });
  await assert.rejects(
    commitWorkspaceAction(
      store.restoreData({
        imported: source,
        mode: "replace",
        includeSettings: false,
      }),
      {
        read: () => data,
        write: async () => {
          throw new Error("disk full");
        },
        dispatch: (action) => {
          data = reduce(data, action);
        },
      },
    ),
    /disk full/,
  );
  assert.equal(data, before);
  assert.equal(source.history[0].customRate, undefined);
});
test("profile saves validate names separately from permissive mock sign-in email", () => {
  const account = { mode: "mock", name: "Demo", email: "anything" };
  assert.equal(
    model.prepareAccountUpdate(account, { name: " New " }).account.name,
    "New",
  );
  assert.ok(model.prepareAccountUpdate(account, { name: " " }).error);
  assert.ok(model.prepareAccountUpdate(account, { email: "bad" }).error);
  assert.ok(
    model.prepareAccountUpdate({ ...account, mode: "guest" }, { name: "New" })
      .error,
  );
});
test("saving a profile name preserves an independently edited email draft", () => {
  const before = { mode: "mock", name: "Old", email: "old@example.com" };
  const draft = { ...before, name: "New", email: "pending@example.com" };
  const result = model.rebaseAccountDraft(draft, before, {
    ...before,
    name: "New",
  });
  assert.equal(result.email, "pending@example.com");
  assert.equal(result.name, "New");
});
test("launch visibility follows the saved default rather than a temporary eye-button choice", () => {
  assert.equal(
    reduce(
      undefined,
      store.hydrate({
        ...initial,
        payVisible: true,
        preferences: { ...initial.preferences, payHiddenByDefault: true },
      }),
    ).payVisible,
    false,
  );
  assert.equal(
    reduce(
      undefined,
      store.hydrate({
        ...initial,
        payVisible: false,
        preferences: { ...initial.preferences, payHiddenByDefault: false },
      }),
    ).payVisible,
    true,
  );
});
test("typical shift preview handles two-day rollover and ignores disabled lunch input", () => {
  const data = state(),
    draft = {
      ...prefs(data, { typicalStartTime: "23:30" }),
      plan: { ...data.defaultPlan, plannedHours: 24, lunchMinutes: 120 },
    };
  assert.match(model.typicalShift(draft), /\(\+2 days\)/);
  assert.doesNotMatch(
    model.typicalShift({
      ...draft,
      plan: { ...draft.plan, lunchEnabled: false, lunchMinutes: NaN },
    }),
    /Enter valid/,
  );
});
test("lock record parsing supports legacy missing counters and normalizes hash case", () => {
  const result = parseLockRecord(
    JSON.stringify({ type: "pin4", salt: "salt", hash: "A".repeat(64) }),
  );
  assert.equal(result.hash, "a".repeat(64));
  assert.equal(result.failures, 0);
  assert.equal(result.biometrics, false);
  assert.equal(parseLockRecord(null), null);
});
test("malformed privacy records fail closed instead of treating them as no lock", () => {
  for (const raw of [
    "",
    "null",
    "{broken",
    JSON.stringify(lock({ hash: "bad" })),
    JSON.stringify(lock({ salt: "" })),
    JSON.stringify(lock({ biometrics: "yes" })),
    JSON.stringify(lock({ failures: null })),
    JSON.stringify(lock({ blockedUntil: Infinity })),
  ])
    assert.throws(() => parseLockRecord(raw), /unreadable/);
});
test("an unlock started before backgrounding cannot reveal the returning app", () => {
  const gate = new PrivacyAttemptGate(),
    token = gate.begin();
  gate.appState("background", false);
  gate.appState("active", false);
  assert.equal(gate.canUnlock(token, "active"), false);
  assert.equal(gate.canUnlock(gate.begin(), "active"), true);
});
test("device-authentication inactivity is distinct from leaving the app", () => {
  const gate = new PrivacyAttemptGate(),
    token = gate.begin();
  gate.appState("inactive", true);
  assert.equal(gate.canUnlock(token, "inactive"), false);
  gate.appState("active", true);
  assert.equal(gate.canUnlock(token, "active"), true);
  gate.appState("background", true);
  gate.appState("active", false);
  assert.equal(gate.canUnlock(token, "active"), false);
});
test("manual lock and unknown native states invalidate pending unlock attempts", () => {
  const gate = new PrivacyAttemptGate(),
    token = gate.begin();
  gate.lock();
  assert.equal(gate.canUnlock(token, "active"), false);
  const next = gate.begin();
  gate.appState("unknown", true);
  assert.equal(gate.canUnlock(next, "active"), false);
});
test("privacy actions cannot overlap and a failed action does not poison later attempts", async () => {
  const run = privacyOperations();
  let release;
  const first = run(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await assert.rejects(
    run(async () => "second"),
    /in progress/,
  );
  release();
  await first;
  await assert.rejects(
    run(async () => {
      throw new Error("failed");
    }),
    /failed/,
  );
  assert.equal(await run(async () => "retry"), "retry");
});
