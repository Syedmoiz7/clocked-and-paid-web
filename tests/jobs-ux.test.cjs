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
const test = require("node:test");
const assert = require("node:assert/strict");
const jobs = require("../src/features/jobs/model.ts");
const history = require("../src/features/history/model.ts");
const pay = require("../src/features/pay/model.ts");
const store = require("../src/store/appSlice.ts");
const { commitWorkspaceAction } = require("../src/services/commitWorkspace.ts");
const { initialAppState: initial, appReducer: reduce } = store;
const profile = (changes) => ({
  ...jobs.newJob("work", 30),
  name: "Work",
  ...changes,
});
const data = (changes) => ({
  ...initial,
  isPremium: true,
  jobs: [profile({ isDefault: true })],
  selectedJobId: "work",
  history: [],
  paychecks: [],
  deductions: [],
  ...changes,
});
const shift = (changes) => ({
  id: "entry",
  date: "2026-10-20",
  jobId: "work",
  startedAt: "2026-10-20T09:00:00",
  endedAt: "2026-10-20T21:00:00",
  lunchMinutes: 0,
  breakMinutes: 0,
  earnings: 0,
  ...changes,
});
const reminder = (changes) => ({
  id: "water",
  name: " Water ",
  message: " Drink ",
  enabled: true,
  trigger: "after-clock-in",
  offsetMinutes: 60,
  atTime: "12:00",
  repeatMinutes: 0,
  priority: "medium",
  ...changes,
});
const fee = (changes) => ({
  id: "fee",
  jobId: "work",
  label: "Fee",
  amount: 10,
  frequency: "monthly",
  enabled: true,
  ...changes,
});

test("new profiles inherit workspace currency, workday and reminder defaults without sharing mutable reminders", () => {
  const state = data({
    defaultPlan: {
      ...initial.defaultPlan,
      hourlyRate: 42,
      lunchMinutes: 45,
      lunchEnabled: false,
    },
    preferences: {
      ...initial.preferences,
      currency: "EUR",
      defaultReminders: { ...jobs.reminderDefaults(), custom: [reminder()] },
    },
  });
  const result = jobs.newJobFromDefaults(state, "new");
  assert.equal(result.hourlyRate, 42);
  assert.equal(result.currency, "EUR");
  assert.equal(result.lunchMinutes, 45);
  assert.equal(result.lunchEnabled, false);
  result.reminderSettings.custom[0].name = "changed";
  assert.equal(state.preferences.defaultReminders.custom[0].name, " Water ");
});
test("default, selected, running and recoverable badges describe distinct states", () => {
  const first = profile({ isDefault: true });
  const second = profile({ id: "other" });
  const state = data({
    jobs: [first, second],
    selectedJobId: "other",
    activeShift: shift({ jobId: "other", endedAt: null }),
    orphanedShift: shift({ id: "orphan", endedAt: null }),
  });
  assert.deepEqual(jobs.jobBadges(state, first), ["Default", "Needs recovery"]);
  assert.deepEqual(jobs.jobBadges(state, second), [
    "Selected in Tracker",
    "Running",
  ]);
});
test("selecting a Tracker profile does not silently change the default flag", () => {
  const state = data({
    jobs: [profile({ isDefault: true }), profile({ id: "other" })],
  });
  const result = reduce(state, store.selectJob("other"));
  assert.equal(result.selectedJobId, "other");
  assert.equal(result.jobs[0].isDefault, true);
  assert.equal(Boolean(result.jobs[1].isDefault), false);
});
test("editing default-job notes cannot switch Tracker away from a different selected job", () => {
  const state = data({
    jobs: [profile({ isDefault: true }), profile({ id: "other" })],
    selectedJobId: "other",
    todayPlan: { ...initial.todayPlan, plannedHours: 4, lunchMinutes: 45 },
  });
  const result = reduce(
    state,
    store.upsertJob({ ...state.jobs[0], notes: "changed" }),
  );
  assert.equal(result.selectedJobId, "other");
  assert.deepEqual(result.todayPlan, state.todayPlan);
});
test("notes-only selected-profile edits preserve every Today Plan override", () => {
  const state = data({
    todayPlan: {
      ...initial.todayPlan,
      plannedHours: 4,
      hourlyRate: 99,
      lunchMinutes: 45,
      overtimeThreshold: 2,
    },
  });
  const result = reduce(
    state,
    store.upsertJob({ ...state.jobs[0], notes: "changed" }),
  );
  assert.deepEqual(result.todayPlan, state.todayPlan);
});
test("changing a selected profile rate updates that default without resetting unrelated planned hours or lunch", () => {
  const state = data({
    todayPlan: {
      ...initial.todayPlan,
      hourlyRate: 30,
      plannedHours: 4,
      lunchMinutes: 45,
    },
  });
  const result = reduce(
    state,
    store.upsertJob({ ...state.jobs[0], hourlyRate: 40 }),
  );
  assert.equal(result.todayPlan.hourlyRate, 40);
  assert.equal(result.todayPlan.plannedHours, 4);
  assert.equal(result.todayPlan.lunchMinutes, 45);
});
test("rate and overtime edits freeze missing historical rules before applying the new profile", () => {
  const state = data({ history: [shift()] });
  const result = reduce(
    state,
    store.upsertJob({
      ...state.jobs[0],
      hourlyRate: 50,
      overtimeThreshold: 6,
      overtimeMultiplier: 2,
    }),
  );
  const old = result.history[0];
  assert.equal(old.customRate, 30);
  assert.equal(old.overtimeThreshold, 8);
  assert.equal(old.currency, "USD");
  assert.equal(history.wagesFor(old, result.jobs, result.defaultPlan), 420);
  assert.equal(pay.shiftAmounts(old, result).gross, 420);
  assert.equal(result.jobs[0].hourlyRate, 50);
});
test("historical custom rates, paid ownership, notes and time stamps survive profile edits", () => {
  const original = shift({
    customRate: 45,
    paid: true,
    paidByPaycheckId: "receipt",
    projectNotes: "Keep",
  });
  const state = data({ history: [original] });
  const result = reduce(
    state,
    store.upsertJob({ ...state.jobs[0], hourlyRate: 60 }),
  );
  assert.equal(result.history[0].customRate, 45);
  assert.equal(result.history[0].paidByPaycheckId, "receipt");
  assert.equal(result.history[0].projectNotes, "Keep");
  assert.equal(result.history[0].startedAt, original.startedAt);
});
test("profile pay edits do not turn flat projects into hourly work", () => {
  const state = data({
    history: [
      shift({ entryType: "project", flatAmount: 100, projectName: "Logo" }),
    ],
  });
  const result = reduce(
    state,
    store.upsertJob({ ...state.jobs[0], hourlyRate: 60 }),
  );
  assert.equal(pay.shiftAmounts(result.history[0], result).gross, 100);
  assert.equal(history.workedMinutes(result.history[0]), 0);
});
test("archival freezes fallback overtime so later global changes cannot reprice old work", () => {
  const state = data({ history: [shift()] });
  const removed = reduce(state, store.removeJob("work"));
  const changed = {
    ...removed,
    defaultPlan: {
      ...removed.defaultPlan,
      overtimeThreshold: 2,
      overtimeMultiplier: 4,
    },
  };
  assert.equal(
    history.wagesFor(changed.history[0], changed.jobs, changed.defaultPlan),
    420,
  );
  assert.equal(changed.jobs[0].archived, true);
});
test("currency cannot reinterpret saved work, receipts or job deductions", () => {
  for (const records of [
    { history: [shift()] },
    { deductions: [fee()] },
    { paychecks: [{ id: "receipt", jobId: "work" }] },
  ]) {
    const state = data(records);
    const changed = { ...state.jobs[0], currency: "EUR" };
    assert.match(jobs.jobEditError(state, changed), /currency/);
    assert.equal(reduce(state, store.upsertJob(changed)), state);
  }
});
test("unused profiles can change currency without inventing an exchange conversion", () => {
  const state = data();
  const result = reduce(
    state,
    store.upsertJob({ ...state.jobs[0], currency: "EUR" }),
  );
  assert.equal(result.jobs[0].currency, "EUR");
  assert.equal(result.jobs[0].hourlyRate, 30);
});
test("recoverable work locks pay/lunch defaults and deletion just like running work", () => {
  const state = data({ orphanedShift: shift({ endedAt: null }) });
  for (const changes of [
    { hourlyRate: 99 },
    { overtimeThreshold: 2 },
    { lunchMinutes: 45 },
    { lunchEnabled: false },
  ]) {
    assert.ok(jobs.jobEditError(state, { ...state.jobs[0], ...changes }));
    assert.equal(
      reduce(state, store.upsertJob({ ...state.jobs[0], ...changes })),
      state,
    );
  }
  assert.equal(reduce(state, store.removeJob("work")), state);
});
test("additional-only running sessions and orphan recovery block changing the selected/default profile", () => {
  for (const pending of [
    { extraShifts: [shift({ endedAt: null })] },
    { orphanedShift: shift({ endedAt: null }) },
  ]) {
    const state = data({
      jobs: [profile({ isDefault: true }), profile({ id: "other" })],
      ...pending,
    });
    assert.equal(reduce(state, store.selectJob("other")), state);
    assert.equal(reduce(state, store.setDefaultJob("other")), state);
  }
});
test("running reminder edits synchronize Tracker switches without resetting its plan or timestamps", () => {
  const state = data({
    activeShift: shift({ endedAt: null }),
    todayPlan: { ...initial.todayPlan, plannedHours: 4 },
  });
  const result = reduce(
    state,
    store.upsertJob({
      ...state.jobs[0],
      reminderSettings: {
        ...jobs.reminderDefaults(),
        sound: false,
        returnReminder: false,
        lunchMode: "off",
      },
    }),
  );
  assert.equal(result.reminders.reminderSound, false);
  assert.equal(result.reminders.returnReminder, false);
  assert.equal(result.reminders.lunchReminder, false);
  assert.deepEqual(result.todayPlan, state.todayPlan);
  assert.deepEqual(result.activeShift, state.activeShift);
});
test("legacy missing defaults can be materialized without falsely blocking notes during a shift", () => {
  const original = {
    id: "work",
    name: "Work",
    hourlyRate: 30,
    color: "#d65c90",
  };
  const state = data({
    jobs: [original],
    activeShift: shift({ endedAt: null }),
  });
  const draft = jobs.prepareJobDraft(
    state,
    { ...original, notes: "changed", currency: "USD" },
    jobs.jobDraftNumbers(state, original),
  );
  assert.equal(draft.error, null);
  assert.equal(jobs.jobEditError(state, draft.job), null);
});
test("deleting the final unused profile restores global plan and reminder effects", () => {
  const state = data({
    todayPlan: { ...initial.todayPlan, hourlyRate: 99 },
    preferences: {
      ...initial.preferences,
      defaultReminders: { ...jobs.reminderDefaults(), sound: false },
    },
  });
  const result = reduce(state, store.removeJob("work"));
  assert.equal(result.jobs.length, 0);
  assert.equal(result.selectedJobId, "");
  assert.deepEqual(result.todayPlan, state.defaultPlan);
  assert.equal(result.reminders.reminderSound, false);
});
test("pay-delay changes invalidate only that job's cached Pay view", () => {
  const original = profile({
    isDefault: true,
    payFrequency: "weekly",
    payPeriodStart: "2026-10-19",
    payDelayDays: 3,
  });
  const state = data({
    jobs: [original],
    paySchedules: {
      work: pay.scheduleFor("weekly", "2026-10-19"),
      __fs__: pay.scheduleFor("monthly", "2026-10-01"),
    },
  });
  const result = reduce(
    state,
    store.upsertJob({ ...original, payDelayDays: 5 }),
  );
  assert.equal(result.paySchedules.work, undefined);
  assert.deepEqual(result.paySchedules.__fs__, state.paySchedules.__fs__);
});
test("unchanged delay and anchor keep cached schedules even if a stored display date rolls forward", () => {
  const original = profile({
    payFrequency: "weekly",
    payPeriodStart: "2026-10-19",
    payDelayDays: 3,
    nextPayDate: "2026-10-28",
  });
  assert.equal(
    jobs.jobScheduleChanged(original, {
      ...original,
      nextPayDate: "2026-11-04",
    }),
    false,
  );
});
test("next pay date rolls across periods using explicit delay without drifting around DST", () => {
  const scheduled = profile({
    payFrequency: "biweekly",
    payPeriodStart: "2026-10-01",
    payDelayDays: 3,
  });
  assert.equal(jobs.nextJobPayDate(scheduled, "2026-10-18"), "2026-10-31");
  assert.equal(jobs.nextJobPayDate(scheduled, "2026-10-31"), "2026-10-31");
  assert.equal(jobs.nextJobPayDate(scheduled, "2026-11-01"), "2026-11-14");
});
test("job draft derives expected dates from delay and preserves month-end anchor", () => {
  const original = profile({
    payFrequency: "monthly",
    payPeriodStart: "2026-01-31",
    payDelayDays: 6,
  });
  const state = data({ jobs: [original] });
  const result = jobs.prepareJobDraft(
    state,
    original,
    { ...jobs.jobDraftNumbers(state, original), payDelayDays: "6" },
    "2026-03-01",
  );
  assert.equal(result.error, null);
  assert.equal(result.job.payPeriodStart, "2026-01-31");
  assert.equal(result.job.nextPayDate, "2026-03-05");
});
test("turning a schedule off ignores and clears stale hidden delay and date fields", () => {
  const state = data();
  const original = profile({
    payPeriodStart: "2026-10-19",
    nextPayDate: "bad",
  });
  const result = jobs.prepareJobDraft(state, original, {
    ...jobs.jobDraftNumbers(state, original),
    payDelayDays: "bad",
  });
  assert.equal(result.error, null);
  assert.equal(result.job.payDelayDays, undefined);
  assert.equal(result.job.nextPayDate, undefined);
  assert.equal(result.job.payPeriodStart, undefined);
});
test("inactive lunch/snooze fields never persist NaN or block saving unrelated edits", () => {
  const original = profile({
    lunchEnabled: false,
    reminderSettings: {
      ...jobs.reminderDefaults(),
      lunchMode: "off",
      overlay: false,
    },
  });
  const state = data();
  const result = jobs.prepareJobDraft(state, original, {
    ...jobs.jobDraftNumbers(state, original),
    lunchMinutes: "",
    lunchHours: "bad",
    snoozeMinutes: "bad",
  });
  assert.equal(result.error, null);
  assert.equal(Number.isFinite(result.job.lunchMinutes), true);
  assert.equal(Number.isFinite(result.job.reminderSettings.lunchHours), true);
  assert.equal(result.job.reminderSettings.snoozeMinutes, 10);
});
test("active required number fields and fractional/negative pay delays are rejected", () => {
  const original = profile({
    payFrequency: "weekly",
    payPeriodStart: "2026-10-19",
    reminderSettings: { ...jobs.reminderDefaults(), lunchMode: "relative" },
  });
  const state = data();
  const numbers = jobs.jobDraftNumbers(state, original);
  for (const changes of [
    { hourlyRate: "" },
    { lunchHours: "" },
    { snoozeMinutes: "" },
    { payDelayDays: "-1" },
    { payDelayDays: "1.5" },
  ])
    assert.ok(
      jobs.prepareJobDraft(state, original, { ...numbers, ...changes }).error,
    );
});
test("job deduction editor rejects hidden scope changes, global IDs and cross-job overwrite", () => {
  const state = data({ deductions: [fee({ jobId: null })] });
  assert.match(jobs.jobDeductionError(state, fee(), "work"), /scope/);
  assert.match(
    jobs.jobDeductionError(data(), fee({ jobId: null }), "work"),
    /scope/,
  );
  assert.equal(jobs.jobDeductionError(data(), fee(), "work"), null);
});
test("deduction/job mutations recheck current entitlement and removed-job state", () => {
  assert.match(
    jobs.jobDeductionError(data({ isPremium: false }), fee(), "work"),
    /Premium/,
  );
  assert.match(
    jobs.jobDeductionError(
      data({ jobs: [profile({ archived: true })] }),
      fee(),
      "work",
    ),
    /removed/,
  );
  assert.match(
    jobs.jobEditError(data({ isPremium: false }), profile({ id: "other" })),
    /Premium/,
  );
  assert.match(
    jobs.jobEditError(data({ jobs: [profile({ archived: true })] }), profile()),
    /removed/,
  );
});
test("reminder drafts validate only active trigger fields and retain no nonfinite hidden values", () => {
  const result = jobs.prepareReminderDraft(
    reminder({ trigger: "at-time", atTime: "12:00" }),
    "bad",
    "bad",
  );
  assert.equal(result.error, null);
  assert.equal(result.reminder.offsetMinutes, 60);
  assert.equal(result.reminder.repeatMinutes, 0);
  assert.equal(result.reminder.name, "Water");
  assert.equal(result.reminder.message, "Drink");
  assert.ok(
    jobs.prepareReminderDraft(
      reminder({ trigger: "at-time", atTime: "bad" }),
      "60",
      "10",
    ).error,
  );
  assert.ok(jobs.prepareReminderDraft(reminder(), "", "10").error);
});
test("repeat off stays zero, while enabled invalid repeat values cannot be saved", () => {
  assert.equal(
    jobs.prepareReminderDraft(reminder(), "60", "bad").reminder.repeatMinutes,
    0,
  );
  assert.ok(
    jobs.prepareReminderDraft(reminder({ repeatMinutes: 10 }), "60", "").error,
  );
});
test("fixed reminders already passed within the clock-in minute are skipped", () => {
  const scheduled = profile({
    reminderSettings: {
      ...jobs.reminderDefaults(),
      lunchMode: "fixed",
      lunchTime: "09:00",
    },
  });
  const alerts = jobs.jobAlerts(
    shift({ startedAt: "2026-10-20T09:00:30", endedAt: null }),
    scheduled,
  );
  assert.equal(alerts.length, 0);
});
test("nonexistent DST wall-clock reminders are skipped rather than moved to another time", () => {
  const scheduled = profile({
    reminderSettings: {
      ...jobs.reminderDefaults(),
      lunchMode: "fixed",
      lunchTime: "02:30",
    },
  });
  const alerts = jobs.jobAlerts(
    shift({
      date: "2026-03-08",
      startedAt: "2026-03-08T00:00:00",
      endedAt: null,
    }),
    scheduled,
  );
  const exists = new Date("2026-03-08T02:30:00").getHours() === 2;
  assert.equal(alerts.length, exists ? 1 : 0);
});
test("failed profile persistence does not change history snapshots, selection or rates", async () => {
  let state = data({ history: [shift()] });
  const before = state;
  await assert.rejects(
    commitWorkspaceAction(
      store.upsertJob({ ...state.jobs[0], hourlyRate: 60 }),
      {
        read: () => state,
        write: async () => {
          throw new Error("disk full");
        },
        dispatch: (action) => {
          state = reduce(state, action);
        },
      },
    ),
    /disk full/,
  );
  assert.equal(state, before);
  assert.equal(state.history[0].customRate, undefined);
  assert.equal(state.jobs[0].hourlyRate, 30);
});
test("editing selected lunch defaults keeps an end-time plan's target and recalculates paid hours", () => {
  const later = new Date(Date.now() + 8 * 60 * 60000);
  const target = `${String(later.getHours()).padStart(2, "0")}:${String(later.getMinutes()).padStart(2, "0")}`;
  const state = data({
    todayPlan: {
      ...initial.todayPlan,
      planningMode: "end-time",
      plannedClockOut: target,
      plannedHours: 7.5,
    },
  });
  const result = reduce(
    state,
    store.upsertJob({ ...state.jobs[0], lunchMinutes: 45 }),
  );
  assert.equal(result.todayPlan.plannedClockOut, target);
  assert.ok(
    result.todayPlan.plannedHours > 7.2 && result.todayPlan.plannedHours < 7.3,
  );
});
