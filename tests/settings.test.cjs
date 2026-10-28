const fs = require("node:fs");
const ts = require("typescript");
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
const settings = require("../src/features/settings/model.ts");
const backup = require("../src/features/settings/backup.ts");
const actions = require("../src/store/appSlice.ts");
const { appReducer: reducer, initialAppState: initial } = actions;
const state = (changes = {}) => ({ ...initial, ...changes });
const shift = (changes = {}) => ({
  id: "entry",
  date: "2026-10-20",
  startedAt: "2026-10-20T09:00:00",
  endedAt: "2026-10-20T17:00:00",
  lunchMinutes: 30,
  breakMinutes: 0,
  earnings: 180,
  jobId: "default",
  currency: "USD",
  ...changes,
});
const receipt = (changes = {}) => ({
  id: "receipt",
  jobId: "default",
  startDate: "2026-10-19",
  endDate: "2026-10-25",
  payDate: "2026-10-30",
  grossPay: 180,
  totalDeductions: 20,
  netPay: 160,
  paid: true,
  ...changes,
});
const read = (payload, data = initial) =>
  backup.parseBackup(JSON.stringify(payload), "backup.json", data);
const draft = (changes = {}) => ({
  ...settings.settingsDraft(initial),
  ...changes,
});

test("default preferences match client clock, quote, privacy and concurrency defaults", () => {
  const p = settings.preferenceDefaults();
  assert.equal(p.clockFormat, "12h");
  assert.equal(p.showDailyQuote, true);
  assert.equal(p.payHiddenByDefault, true);
  assert.equal(p.allowConcurrentShifts, false);
  assert.equal(p.defaultReminders.lunchHours, 5);
});
test("settings reject invalid hours, lunch and pay values", () => {
  for (const plannedHours of [NaN, Infinity, 0, 25])
    assert.ok(
      settings.validateSettings(
        draft({ plan: { ...initial.defaultPlan, plannedHours } }),
      ),
    );
  for (const lunchMinutes of [0, 121, 5.5])
    assert.ok(
      settings.validateSettings(
        draft({ plan: { ...initial.defaultPlan, lunchMinutes } }),
      ),
    );
  assert.ok(
    settings.validateSettings(
      draft({ plan: { ...initial.defaultPlan, hourlyRate: -1 } }),
    ),
  );
});
test("settings reject invalid formats, themes, times, flags and timer modes", () => {
  for (const change of [
    { clockFormat: "bad" },
    { themeHue: -1 },
    { typicalStartTime: "25:00" },
    { showDailyQuote: "yes" },
    { headerTimerMode: "bad" },
  ])
    assert.ok(
      settings.validateSettings(
        draft({ preferences: { ...initial.preferences, ...change } }),
      ),
    );
  assert.ok(
    settings.validateSettings(
      draft({ plan: { ...initial.defaultPlan, lunchEnabled: "yes" } }),
    ),
  );
});
test("saving defaults updates a non-running Tracker without changing a job's explicit rate", () => {
  const next = reducer(
    initial,
    actions.saveSettings(
      draft({
        plan: {
          ...initial.defaultPlan,
          plannedHours: 10,
          hourlyRate: 40,
          lunchMinutes: 45,
        },
      }),
    ),
  );
  assert.equal(next.defaultPlan.hourlyRate, 40);
  assert.equal(next.todayPlan.hourlyRate, 24);
  assert.equal(next.todayPlan.plannedHours, 10);
  assert.equal(next.todayPlan.lunchMinutes, 45);
});
test("saving defaults does not reset the active shift's current plan", () => {
  const data = state({
    activeShift: shift({ endedAt: null }),
    todayPlan: { ...initial.todayPlan, plannedHours: 7 },
  });
  const next = reducer(
    data,
    actions.saveSettings(
      draft({
        plan: {
          ...initial.defaultPlan,
          plannedHours: 12,
          timerDirection: "count-down",
        },
      }),
    ),
  );
  assert.equal(next.todayPlan.plannedHours, 7);
  assert.equal(next.todayPlan.timerDirection, "count-down");
  assert.deepEqual(next.activeShift, data.activeShift);
});
test("invalid drafts never persist settings", () => {
  const next = reducer(
    initial,
    actions.saveSettings(
      draft({ plan: { ...initial.defaultPlan, plannedHours: NaN } }),
    ),
  );
  assert.deepEqual(next, initial);
});
test("hidden-pay default changes affect the shared visibility flag", () => {
  const next = reducer(
    initial,
    actions.saveSettings(
      draft({
        preferences: { ...initial.preferences, payHiddenByDefault: false },
      }),
    ),
  );
  assert.equal(next.payVisible, true);
  assert.equal(reducer(next, actions.saveSettings(draft())).payVisible, false);
});
test("job-specific reminder settings take priority over Settings defaults", () => {
  const { newJob } = require("../src/features/jobs/model.ts");
  const profile = { ...newJob("default"), name: "Acme" };
  const next = reducer(
    state({ jobs: [profile] }),
    actions.saveSettings(
      draft({
        preferences: {
          ...initial.preferences,
          defaultReminders: {
            ...initial.preferences.defaultReminders,
            sound: false,
          },
        },
      }),
    ),
  );
  assert.equal(next.reminders.reminderSound, true);
});
test("Settings default reminders apply to a job without overrides", () => {
  const next = reducer(
    initial,
    actions.saveSettings(
      draft({
        preferences: {
          ...initial.preferences,
          defaultReminders: {
            ...initial.preferences.defaultReminders,
            sound: false,
            snoozeMinutes: 15,
          },
        },
      }),
    ),
  );
  assert.equal(next.reminders.reminderSound, false);
  assert.equal(next.reminders.reminderSnoozeMinutes, 15);
});
test("legacy hydration preserves visibility behavior and gains typed Settings defaults", () => {
  const next = reducer(initial, actions.hydrate({ history: [] }));
  assert.equal(next.preferences.clockFormat, "12h");
  assert.equal(next.preferences.payHiddenByDefault, false);
  assert.equal(next.payVisible, true);
  assert.equal(next.account.mode, "guest");
});
test("theme changes are independent of buffered workday defaults", () => {
  const next = reducer(initial, actions.setThemeHue(220));
  assert.equal(next.preferences.themeHue, 220);
  assert.deepEqual(next.defaultPlan, initial.defaultPlan);
  assert.equal(
    reducer(next, actions.setThemeHue(999)).preferences.themeHue,
    220,
  );
});
test("clock labels handle midnight, noon and 24-hour format", () => {
  assert.equal(settings.clockLabel("00:05", "12h"), "12:05 AM");
  assert.equal(settings.clockLabel("12:05", "12h"), "12:05 PM");
  assert.equal(settings.clockLabel("23:30", "24h"), "23:30");
  assert.equal(settings.clockLabel("25:00", "24h"), "—");
});
test("typical shift preview includes lunch and overnight markers", () => {
  const result = settings.typicalShift(
    draft({
      preferences: {
        ...initial.preferences,
        typicalStartTime: "22:00",
        clockFormat: "24h",
      },
    }),
  );
  assert.equal(result, "22:00 → 06:30 (+1 day)");
});
test("mock account and password validation does not imply server authentication", () => {
  assert.ok(
    settings.validateAccount({
      mode: "mock",
      name: "",
      email: "a@example.com",
    }),
  );
  assert.ok(
    settings.validateAccount({ mode: "mock", name: "A", email: "bad" }),
  );
  assert.equal(
    settings.validateAccount({
      mode: "mock",
      name: "A",
      email: "a@example.com",
    }),
    null,
  );
  assert.ok(settings.validatePassword("short", "short"));
  assert.ok(settings.validatePassword("longpass", "different"));
  assert.equal(settings.validatePassword("longpass", "longpass"), null);
});
test("privacy credentials enforce exact digit counts or password length", () => {
  assert.equal(settings.validateLockCredential("pin4", "0123"), null);
  assert.ok(settings.validateLockCredential("pin4", "12345"));
  assert.ok(settings.validateLockCredential("pin6", "1234ab"));
  assert.equal(settings.validateLockCredential("pin6", "012345"), null);
  assert.ok(settings.validateLockCredential("password", "12345"));
});
test("mobile JSON round-trips business collections and estimator schedules", () => {
  const data = state({
    history: [shift()],
    paychecks: [receipt()],
    deductions: [
      {
        id: "ded",
        label: "Tax",
        amount: 10,
        frequency: "monthly",
        enabled: true,
      },
    ],
    paySchedules: {
      default: {
        frequency: "weekly",
        periodStart: "2026-10-19",
        periodEnd: "2026-10-25",
        payDate: "2026-10-30",
        payDelayDays: 5,
        anchorDate: "2026-10-19",
      },
    },
  });
  const imported = backup.parseBackup(
    backup.backupText(data),
    "mobile.json",
    initial,
  );
  assert.deepEqual(imported.jobs, data.jobs);
  assert.equal(imported.history[0].lunchMinutes, 30);
  assert.deepEqual(imported.paychecks, data.paychecks);
  assert.deepEqual(imported.deductions, data.deductions);
  assert.deepEqual(imported.paySchedules, data.paySchedules);
});
test("backup excludes account credentials and entitlement/permission state", () => {
  const parsed = JSON.parse(
    backup.backupText(
      state({
        isPremium: true,
        account: { mode: "mock", name: "Private", email: "secret@example.com" },
      }),
    ),
  );
  for (const key of [
    "account",
    "isPremium",
    "notificationPermission",
    "privacyLock",
    "password",
  ])
    assert.equal(parsed[key], undefined);
  assert.ok(!JSON.stringify(parsed).includes("secret@example.com"));
});
test("active shifts export as drafts and never auto-resume during import", () => {
  const data = state({
    activeShift: shift({
      endedAt: null,
      lunchStartedAt: "2026-10-20T12:00:00",
    }),
  });
  const imported = backup.parseBackup(
    backup.backupText(data),
    "backup.json",
    initial,
  );
  assert.equal(imported.history[0].endedAt, null);
  assert.equal(imported.history[0].lunchStartedAt, null);
  assert.equal(
    backup.applyImport(initial, imported, "merge", true).activeShift,
    null,
  );
});
test("client web JSON converts overnight work, lunch, breaks and tips", () => {
  const imported = read({
    version: "1",
    history: [
      {
        id: "web",
        date: "2026-10-20",
        clockIn: "22:00",
        clockOut: "06:00",
        lunchStart: "01:00",
        lunchEnd: "01:30",
        breaks: [{ start: "03:00", end: "03:10" }],
        tips: 20,
        tipType: "paycheck",
        isPaid: true,
      },
    ],
  });
  const entry = imported.history[0];
  assert.equal(entry.lunchMinutes, 30);
  assert.equal(entry.breakMinutes, 10);
  assert.equal(new Date(entry.endedAt).getDate(), 21);
  assert.equal(entry.paid, true);
  assert.equal(entry.tips, 20);
  assert.equal(entry.tipType, "paycheck");
});
test("client web settings and modern/legacy deductions are imported", () => {
  const imported = read({
    history: [],
    settings: {
      hourlyRate: 32,
      overtimeMultiplier: 2,
      typicalHours: 10,
      clockFormat: "24h",
      hoursBeforeLunchReminder: 4,
    },
    deductions: [
      {
        id: "modern",
        name: "Insurance",
        amount: 50,
        enabled: true,
        frequency: "monthly",
      },
      { id: "legacy", name: "Tax", percentage: 15 },
    ],
  });
  assert.equal(imported.settings.plan.hourlyRate, 32);
  assert.equal(imported.settings.preferences.clockFormat, "24h");
  assert.equal(imported.deductions[0].label, "Insurance");
  assert.equal(imported.deductions[1].amount, 15);
  assert.equal(imported.deductions[1].isPercentage, true);
});
test("project payouts, currency and notes survive mobile and client imports", () => {
  const imported = read({
    history: [
      {
        id: "p",
        date: "2026-10-20",
        clockIn: null,
        clockOut: null,
        entryType: "project",
        projectName: "Design",
        flatAmount: 500,
        currency: "EUR",
        projectNotes: "A, B\nC",
      },
    ],
  });
  assert.equal(imported.history[0].flatAmount, 500);
  assert.equal(imported.history[0].currency, "EUR");
  assert.equal(imported.history[0].projectNotes, "A, B\nC");
});
test("malformed JSON, unsupported version and oversized files fail before mutation", () => {
  assert.throws(() => backup.parseBackup("{bad", "a.json", initial), /JSON/);
  assert.throws(
    () => read({ format: "clocked-and-paid-mobile", version: 99, history: [] }),
    /version/,
  );
  assert.throws(
    () =>
      backup.parseBackup("x".repeat(10 * 1024 * 1024 + 1), "a.json", initial),
    /10 MB/,
  );
  assert.throws(
    () => backup.parseBackup("text", "a.txt", initial),
    /json or .csv/,
  );
});
test("invalid dates, amounts, ranges, flags and duplicate IDs are rejected", () => {
  for (const changes of [
    { date: "2026-02-30" },
    { earnings: -1 },
    { endedAt: "2026-10-20T08:00:00" },
    { paid: "yes" },
    { projectNotes: {} },
  ])
    assert.throws(() => read({ history: [shift(changes)] }));
  assert.throws(() => read({ history: [shift(), shift()] }), /Duplicate/);
});
test("invalid job profiles, deductions and receipts are rejected", () => {
  assert.throws(() =>
    read({ history: [], jobs: [{ ...initial.jobs[0], hourlyRate: -1 }] }),
  );
  assert.throws(() =>
    read({
      history: [],
      deductions: [
        { id: "x", label: "Bad", amount: 10, frequency: "bad", enabled: true },
      ],
    }),
  );
  assert.throws(() =>
    read({ history: [], paychecks: [receipt({ netPay: 500 })] }),
  );
});
test("restore ignores injected root entitlement and privacy configuration fields", () => {
  const imported = read({
    history: [shift()],
    isPremium: true,
    account: { mode: "mock" },
    privacyLock: { hash: "fake" },
  });
  const result = backup.applyImport(initial, imported, "merge", true);
  assert.equal(result.isPremium, false);
  assert.deepEqual(result.account, initial.account);
  assert.equal(result.privacyLock, undefined);
});
test("unsafe record/scope IDs and invalid pay schedules are rejected", () => {
  assert.throws(() => read({ history: [shift({ id: "__proto__" })] }));
  assert.throws(() =>
    read({
      history: [],
      paySchedules: JSON.parse('{"__proto__":{"frequency":"weekly"}}'),
    }),
  );
  assert.throws(() =>
    read({
      history: [],
      paySchedules: { x: { frequency: "weekly", periodStart: "bad" } },
    }),
  );
});
test("merge is idempotent, existing IDs win, and live work is preserved", () => {
  const live = shift({ id: "live", endedAt: null });
  const data = state({ activeShift: live, history: [shift()] });
  const imported = read({
    history: [shift({ earnings: 500 }), live, shift({ id: "new" })],
  });
  const result = backup.applyImport(data, imported, "merge", false);
  assert.equal(result.history.length, 2);
  assert.equal(
    result.history.find((item) => item.id === "entry").earnings,
    180,
  );
  assert.deepEqual(result.activeShift, live);
  assert.equal(
    result.history.some((item) => item.id === "live"),
    false,
  );
  assert.deepEqual(
    backup.applyImport(result, imported, "merge", false),
    result,
  );
});
test("replace is blocked if any primary or additional shift is running", () => {
  for (const changes of [
    { activeShift: shift({ endedAt: null }) },
    { extraShifts: [shift({ endedAt: null })] },
  ])
    assert.throws(
      () =>
        backup.applyImport(
          state(changes),
          read({ history: [] }),
          "replace",
          false,
        ),
      /Clock out/,
    );
});
test("history-only replace preserves jobs, deductions, receipts, preferences and entitlement", () => {
  const data = state({
    isPremium: true,
    history: [shift()],
    paychecks: [receipt()],
  });
  const result = backup.applyImport(
    data,
    read({ history: [] }),
    "replace",
    false,
  );
  assert.equal(result.history.length, 0);
  assert.deepEqual(result.jobs, data.jobs);
  assert.deepEqual(result.paychecks, data.paychecks);
  assert.equal(result.isPremium, true);
  assert.deepEqual(result.preferences, data.preferences);
});
test("full replace can clear included collections without resurrecting starter jobs", () => {
  const imported = read({
    format: "clocked-and-paid-mobile",
    version: 1,
    history: [],
    jobs: [],
    deductions: [],
    paychecks: [],
    paySchedules: {},
  });
  const result = backup.applyImport(initial, imported, "replace", false);
  assert.equal(result.jobs.length, 0);
  assert.equal(result.selectedJobId, "");
  assert.equal(reducer(initial, actions.hydrate(result)).jobs.length, 0);
});
test("restored job profiles have one default even when files claim several", () => {
  const imported = read({
    history: [],
    jobs: [
      { ...initial.jobs[0], id: "a", isDefault: true },
      { ...initial.jobs[0], id: "b", isDefault: true },
    ],
  });
  assert.equal(
    backup
      .applyImport(initial, imported, "replace", false)
      .jobs.filter((item) => item.isDefault).length,
    1,
  );
});
test("overlapping imported receipts cannot duplicate existing payments", () => {
  const imported = read({ history: [], paychecks: [receipt({ id: "other" })] });
  assert.throws(
    () =>
      backup.applyImport(
        state({ paychecks: [receipt()] }),
        imported,
        "merge",
        false,
      ),
    /Overlapping/,
  );
});
test("restoring preferences is explicit and never changes the active plan", () => {
  const imported = read({
    history: [],
    settings: { hourlyRate: 45, typicalHours: 12 },
  });
  assert.equal(
    backup.applyImport(initial, imported, "merge", false).defaultPlan
      .plannedHours,
    8,
  );
  const live = state({
    activeShift: shift({ endedAt: null }),
    todayPlan: { ...initial.todayPlan, plannedHours: 7 },
  });
  const result = backup.applyImport(live, imported, "merge", true);
  assert.equal(result.defaultPlan.plannedHours, 12);
  assert.equal(result.todayPlan.plannedHours, 7);
});
test("CSV tokenizer handles escaped quotes, commas, CRLF and multiline notes", () => {
  assert.deepEqual(
    backup.csvRows('Date,Notes\r\n2026-10-20,"A, B\nC ""quote"""\r\n'),
    [
      ["Date", "Notes"],
      ["2026-10-20", 'A, B\nC "quote"'],
    ],
  );
  assert.throws(
    () => backup.csvRows('Date,Notes\n2026-10-20,"oops'),
    /Unclosed/,
  );
});
test("client CSV restores overnight times and lunch with a BOM", () => {
  const imported = backup.parseBackup(
    "\uFEFFDate,Clock In,Lunch Start,Lunch End,Clock Out\r\n2026-10-20,22:00,01:00,01:30,06:00",
    "web.csv",
    initial,
  );
  assert.equal(imported.history[0].lunchMinutes, 30);
  assert.equal(new Date(imported.history[0].endedAt).getDate(), 21);
});
test("mobile CSV retains multiline project data and spreadsheet formulas are neutralized", () => {
  const data = state({
    history: [
      shift({
        entryType: "project",
        projectName: "=HYPERLINK(1)",
        flatAmount: 500,
        projectNotes: 'A, B\nC "quote"',
      }),
    ],
  });
  const text = backup.csvText(data);
  assert.ok(text.includes("'=HYPERLINK"));
  const imported = backup.parseBackup(text, "mobile.csv", initial);
  assert.equal(imported.history[0].flatAmount, 500);
  assert.equal(imported.history[0].projectNotes, 'A, B\nC "quote"');
});
test("invalid CSV dates and missing headers fail instead of silently dropping records", () => {
  assert.throws(
    () =>
      backup.parseBackup("Wrong,Clock In\n2026-10-20,09:00", "a.csv", initial),
    /Date/,
  );
  assert.throws(() =>
    backup.parseBackup("Date,Clock In\n2026-02-30,09:00", "a.csv", initial),
  );
});
test("reset clears business records and preferences but retains account and demo entitlement", () => {
  const data = state({
    account: { mode: "mock", name: "A", email: "a@example.com" },
    isPremium: true,
    history: [shift()],
    activeShift: shift({ endedAt: null }),
    paychecks: [receipt()],
    preferences: { ...initial.preferences, themeHue: 220 },
  });
  const next = reducer(data, actions.resetLocalData());
  assert.equal(next.history.length, 0);
  assert.equal(next.activeShift, null);
  assert.equal(next.paychecks.length, 0);
  assert.equal(next.preferences.themeHue, 338);
  assert.deepEqual(next.account, data.account);
  assert.equal(next.isPremium, true);
});
test("CSV re-import retains exported IDs, job links, break totals and tip payment type", () => {
  const data = state({
    history: [
      shift({
        id: "stable-id",
        breakMinutes: 10,
        tips: 25,
        tipType: "paycheck",
      }),
    ],
  });
  const imported = backup.parseBackup(
    backup.csvText(data),
    "history.csv",
    initial,
  );
  assert.equal(imported.history[0].id, "stable-id");
  assert.equal(imported.history[0].jobId, "default");
  assert.equal(imported.history[0].breakMinutes, 10);
  assert.equal(imported.history[0].tipType, "paycheck");
  assert.equal(
    backup.applyImport(data, imported, "merge", false).history.length,
    1,
  );
});
test("client CSV stable IDs survive row reordering without merging different shifts", () => {
  const first = backup.parseBackup(
    "Date,Clock In,Clock Out\n2026-10-20,09:00,12:00\n2026-10-20,13:00,17:00",
    "a.csv",
    initial,
  );
  const second = backup.parseBackup(
    "Date,Clock In,Clock Out\n2026-10-20,13:00,17:00\n2026-10-20,09:00,12:00",
    "b.csv",
    initial,
  );
  assert.deepEqual(
    first.history.map((item) => item.id).sort(),
    second.history.map((item) => item.id).sort(),
  );
});
test("concurrent shifts require both the preference and Premium entitlement", () => {
  const extra = shift({ id: "extra", jobId: "second", endedAt: null });
  const data = state({ activeShift: shift({ endedAt: null }) });
  assert.equal(
    reducer(data, actions.startExtraShift(extra)).extraShifts.length,
    0,
  );
  assert.equal(
    reducer({ ...data, isPremium: true }, actions.startExtraShift(extra))
      .extraShifts.length,
    0,
  );
  const enabled = {
    ...data,
    isPremium: true,
    preferences: { ...data.preferences, allowConcurrentShifts: true },
  };
  const next = reducer(enabled, actions.startExtraShift(extra));
  assert.equal(next.extraShifts.length, 1);
  assert.equal(
    reducer(next, actions.startExtraShift(extra)).extraShifts.length,
    1,
  );
});
test("unlabeled historical wages use global defaults, not whichever job is selected today", () => {
  const pay = require("../src/features/pay/model.ts");
  const data = state({
    defaultPlan: { ...initial.defaultPlan, hourlyRate: 40 },
    todayPlan: { ...initial.todayPlan, hourlyRate: 99 },
  });
  assert.equal(
    pay.shiftAmounts(shift({ jobId: null, lunchMinutes: 0 }), data).wages,
    320,
  );
});
test("new unlabeled History entries inherit the global currency", () => {
  const history = require("../src/features/history/model.ts");
  const value = {
    ...history.blankDraft("shift"),
    date: "2026-10-20",
    start: "09:00",
    end: "17:00",
    jobId: null,
  };
  const result = history.prepareEntry(
    value,
    [],
    initial.defaultPlan,
    undefined,
    "EUR",
  );
  assert.equal(result.ok, true);
  assert.equal(result.entry.currency, "EUR");
});
