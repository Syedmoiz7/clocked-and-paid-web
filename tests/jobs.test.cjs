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
const actions = require("../src/store/appSlice.ts");
const { appReducer: reducer, initialAppState: initial } = actions;
const pay = require("../src/features/pay/model.ts");
const history = require("../src/features/history/model.ts");
const job = (changes = {}) => ({
  ...jobs.newJob("work", 30),
  name: "Acme",
  ...changes,
});
const data = (changes = {}) => ({ ...initial, isPremium: true, ...changes });
const shift = (changes = {}) => ({
  id: "shift",
  date: "2026-10-20",
  startedAt: "2026-10-20T09:00:00",
  endedAt: null,
  lunchMinutes: 0,
  breakMinutes: 0,
  earnings: 0,
  jobId: "work",
  ...changes,
});
const custom = (changes = {}) => ({
  id: "water",
  name: "Hydration",
  message: "Drink water",
  enabled: true,
  trigger: "after-clock-in",
  offsetMinutes: 60,
  atTime: "12:00",
  repeatMinutes: 0,
  priority: "medium",
  ...changes,
});
const settings = (changes = {}) => ({ ...jobs.reminderDefaults(), ...changes });

test("job validation rejects blank names and non-finite or negative rates", () => {
  assert.match(jobs.validateJob(job({ name: " " })), /name/);
  for (const hourlyRate of [NaN, Infinity, -1])
    assert.match(jobs.validateJob(job({ hourlyRate })), /rate/);
  assert.equal(jobs.validateJob(job({ hourlyRate: 0 })), null);
});
test("job validation checks currency and client overtime bounds", () => {
  assert.match(jobs.validateJob(job({ currency: "ZZZ" })), /currency/);
  assert.match(jobs.validateJob(job({ overtimeThreshold: 25 })), /24/);
  assert.match(jobs.validateJob(job({ overtimeMultiplier: 4.1 })), /4/);
  assert.equal(
    jobs.validateJob(job({ overtimeThreshold: 8, overtimeMultiplier: 1.5 })),
    null,
  );
});
test("lunch and reminder numeric fields reject invalid values", () => {
  for (const lunchMinutes of [NaN, -1, 121, 1.5])
    assert.match(jobs.validateJob(job({ lunchMinutes })), /Lunch/);
  assert.match(
    jobs.validateJob(
      job({
        reminderSettings: settings({ lunchMode: "relative", lunchHours: 0 }),
      }),
    ),
    /Lunch reminder/,
  );
  assert.match(
    jobs.validateJob(
      job({ reminderSettings: settings({ repeatMinutes: -1 }) }),
    ),
    /Re-fire/,
  );
  assert.match(
    jobs.validateJob(job({ reminderSettings: settings({ snoozeMinutes: 0 }) })),
    /Snooze/,
  );
});
test("scheduled jobs require a real anchor date and valid expected date", () => {
  assert.match(jobs.validateJob(job({ payFrequency: "weekly" })), /anchor/);
  assert.match(
    jobs.validateJob(
      job({ payFrequency: "weekly", payPeriodStart: "2026-02-30" }),
    ),
    /anchor/,
  );
  assert.match(jobs.validateJob(job({ nextPayDate: "bad" })), /pay date/);
});
test("normalization trims identity and derives inclusive weekly period end", () => {
  const value = jobs.normalizeJob(
    job({
      name: " Acme ",
      title: " Cashier ",
      notes: " Notes ",
      payFrequency: "weekly",
      payPeriodStart: "2026-10-19",
    }),
  );
  assert.equal(value.name, "Acme");
  assert.equal(value.title, "Cashier");
  assert.equal(value.notes, "Notes");
  assert.equal(value.payPeriodEnd, "2026-10-25");
});
test("clearing pay frequency clears obsolete schedule fields", () => {
  const value = jobs.normalizeJob(
    job({
      payPeriodStart: "2026-10-19",
      payPeriodEnd: "2026-10-25",
      nextPayDate: "2026-10-30",
    }),
  );
  assert.equal(value.payPeriodStart, undefined);
  assert.equal(value.payPeriodEnd, undefined);
  assert.equal(value.nextPayDate, undefined);
});
test("generated monthly preview preserves month-end anchor and adjacent boundaries", () => {
  const preview = jobs.schedulePreview(
    job({ payFrequency: "monthly", payPeriodStart: "2026-01-31" }),
    "2026-03-10",
  );
  assert.equal(preview[1].start, "2026-02-28");
  assert.equal(preview[1].end, "2026-03-30");
  assert.equal(preview[2].start, "2026-03-31");
  assert.equal(preview[0].end, "2026-02-27");
});
test("first created job becomes the only default and applies Tracker defaults", () => {
  const result = reducer(
    data({ jobs: [], selectedJobId: "" }),
    actions.upsertJob(
      job({
        overtimeThreshold: 7,
        overtimeMultiplier: 2,
        lunchEnabled: false,
        lunchMinutes: 20,
      }),
    ),
  );
  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].isDefault, true);
  assert.equal(result.selectedJobId, "work");
  assert.equal(result.todayPlan.hourlyRate, 30);
  assert.equal(result.todayPlan.overtimeThreshold, 7);
  assert.equal(result.todayPlan.overtimeMultiplier, 2);
  assert.equal(result.todayPlan.lunchEnabled, false);
});
test("adding another job does not change selection unless explicitly default", () => {
  const result = reducer(data(), actions.upsertJob(job()));
  assert.equal(result.jobs.length, 2);
  assert.equal(result.selectedJobId, "default");
  assert.equal(result.todayPlan.hourlyRate, 24);
});
test("Free cannot create a second active profile; Premium preview can", () => {
  const free = reducer(initial, actions.upsertJob(job()));
  assert.equal(free.jobs.length, 1);
  const pro = reducer(
    reducer(initial, actions.setPremiumPreview(true)),
    actions.upsertJob(job()),
  );
  assert.equal(pro.jobs.length, 2);
});
test("a Free user can create a first job after deleting the previous profile", () => {
  const empty = reducer(initial, actions.removeJob("default"));
  assert.equal(empty.jobs.length, 0);
  assert.equal(reducer(empty, actions.upsertJob(job())).jobs.length, 1);
});
test("setting a default demotes all others and applies plan and reminder effects", () => {
  const result = reducer(
    data({
      jobs: [
        job({ id: "old", isDefault: true }),
        job({
          reminderSettings: settings({
            lunchMode: "relative",
            sound: false,
            snoozeMinutes: 15,
          }),
        }),
      ],
    }),
    actions.setDefaultJob("work"),
  );
  assert.equal(result.jobs.filter((item) => item.isDefault).length, 1);
  assert.equal(result.selectedJobId, "work");
  assert.equal(result.reminders.lunchReminder, true);
  assert.equal(result.reminders.reminderSound, false);
  assert.equal(result.reminders.reminderSnoozeMinutes, 15);
});
test("job selection uses saved defaults, not the previous job's overtime or lunch", () => {
  const state = data({
    jobs: [job()],
    todayPlan: { ...initial.todayPlan, overtimeThreshold: 2, lunchMinutes: 99 },
  });
  const result = reducer(state, actions.selectJob("work"));
  assert.equal(
    result.todayPlan.overtimeThreshold,
    initial.defaultPlan.overtimeThreshold,
  );
  assert.equal(result.todayPlan.lunchMinutes, 30);
});
test("running shifts cannot be switched to a different active job", () => {
  const state = data({
    jobs: [job(), job({ id: "other" })],
    activeShift: shift(),
    selectedJobId: "work",
  });
  assert.equal(
    reducer(state, actions.selectJob("other")).selectedJobId,
    "work",
  );
  assert.equal(
    reducer(state, actions.setDefaultJob("other")).selectedJobId,
    "work",
  );
  assert.match(
    jobs.jobEditError(state, job({ id: "other", isDefault: true })),
    /Clock out/,
  );
});
test("running job rates and overtime cannot change mid-shift", () => {
  const state = data({ jobs: [job()], activeShift: shift() });
  assert.match(jobs.jobEditError(state, job({ hourlyRate: 99 })), /Clock out/);
  assert.equal(
    reducer(state, actions.upsertJob(job({ hourlyRate: 99 }))).jobs[0]
      .hourlyRate,
    30,
  );
});
test("unrelated profile editing is allowed while a shift runs and preserves its plan", () => {
  const state = data({
    jobs: [job(), job({ id: "other" })],
    activeShift: shift(),
    selectedJobId: "work",
  });
  const result = reducer(
    state,
    actions.upsertJob(job({ id: "other", hourlyRate: 40 })),
  );
  assert.equal(result.jobs[1].hourlyRate, 40);
  assert.deepEqual(result.todayPlan, state.todayPlan);
});
test("schedule changes invalidate only that job's estimator setup and preserve receipts", () => {
  const state = data({
    jobs: [job({ payFrequency: "weekly", payPeriodStart: "2026-10-19" })],
    paySchedules: {
      work: { periodStart: "2026-10-19" },
      other: { periodStart: "2026-01-01" },
    },
    paychecks: [
      {
        id: "receipt",
        jobId: "work",
        startDate: "2026-10-19",
        endDate: "2026-10-25",
        paid: true,
      },
    ],
  });
  const result = reducer(
    state,
    actions.upsertJob(
      job({ payFrequency: "biweekly", payPeriodStart: "2026-10-19" }),
    ),
  );
  assert.equal(result.paySchedules.work, undefined);
  assert.ok(result.paySchedules.other);
  assert.deepEqual(result.paychecks, state.paychecks);
});
test("ordinary profile edits preserve independent estimator schedules", () => {
  const state = data({
    jobs: [job()],
    paySchedules: { work: { periodStart: "2026-10-19" } },
  });
  assert.deepEqual(
    reducer(state, actions.upsertJob(job({ notes: "Updated" }))).paySchedules,
    state.paySchedules,
  );
});
test("deleting an unreferenced job removes it and chooses a remaining default", () => {
  const result = reducer(
    data({
      jobs: [job({ isDefault: true }), job({ id: "other" })],
      selectedJobId: "work",
    }),
    actions.removeJob("work"),
  );
  assert.equal(result.jobs.length, 1);
  assert.equal(result.selectedJobId, "other");
  assert.equal(result.jobs[0].isDefault, true);
});
test("referenced job deletion archives it without deleting shifts, paychecks or deductions", () => {
  const state = data({
    jobs: [job()],
    selectedJobId: "work",
    history: [shift({ endedAt: "2026-10-20T17:00:00" })],
    paychecks: [{ id: "receipt", jobId: "work" }],
    deductions: [{ id: "ded", jobId: "work" }],
  });
  const result = reducer(state, actions.removeJob("work"));
  assert.equal(result.jobs[0].archived, true);
  assert.equal(result.selectedJobId, "");
  assert.equal(result.history[0].id, state.history[0].id);
  assert.equal(result.history[0].startedAt, state.history[0].startedAt);
  assert.equal(
    history.wagesFor(result.history[0], result.jobs, result.defaultPlan),
    history.wagesFor(state.history[0], state.jobs, state.defaultPlan),
  );
  assert.deepEqual(result.paychecks, state.paychecks);
  assert.deepEqual(result.deductions, state.deductions);
});
test("an archived job remains a valid historical wage reference but cannot be selected", () => {
  const state = data({
    jobs: [job({ archived: true, hourlyRate: 30 })],
    selectedJobId: "",
  });
  const result = reducer(state, actions.selectJob("work"));
  assert.equal(result.selectedJobId, "");
  const amount = pay.shiftAmounts(
    shift({ endedAt: "2026-10-20T17:00:00" }),
    state,
  );
  assert.equal(amount.gross, 240);
});
test("neither primary nor additional running jobs can be deleted", () => {
  for (const changes of [
    { activeShift: shift() },
    { extraShifts: [shift()] },
  ]) {
    assert.equal(
      reducer(data({ jobs: [job()], ...changes }), actions.removeJob("work"))
        .jobs.length,
      1,
    );
  }
});
test("hydration preserves deliberately empty jobs and does not resurrect the starter", () => {
  const result = reducer(
    initial,
    actions.hydrate({ jobs: [], selectedJobId: "" }),
  );
  assert.equal(result.jobs.length, 0);
  assert.equal(result.selectedJobId, "");
});
test("hydration chooses an unarchived default and supplies reminder acknowledgements", () => {
  const result = reducer(
    initial,
    actions.hydrate({
      jobs: [job({ id: "archived", archived: true }), job({ isDefault: true })],
      selectedJobId: "archived",
    }),
  );
  assert.equal(result.selectedJobId, "work");
  assert.deepEqual(result.jobReminderAcknowledgements, {});
});
test("Tracker reminder edits update the selected job's stored reminder settings", () => {
  const state = data({ jobs: [job()], selectedJobId: "work" });
  const result = reducer(
    state,
    actions.updateReminders({
      lunchReminder: true,
      reminderSound: false,
      reminderOverlay: false,
      reminderSnoozeMinutes: 15,
    }),
  );
  assert.equal(result.jobs[0].reminderSettings.lunchMode, "relative");
  assert.equal(result.jobs[0].reminderSettings.sound, false);
  assert.equal(result.jobs[0].reminderSettings.overlay, false);
  assert.equal(result.jobs[0].reminderSettings.snoozeMinutes, 15);
});
test("custom reminder validation covers required names, offsets, repeats and times", () => {
  assert.match(jobs.validateReminder(custom({ name: " " })), /name/);
  for (const offsetMinutes of [0, 481, NaN, 1.5])
    assert.match(jobs.validateReminder(custom({ offsetMinutes })), /offset/);
  assert.match(jobs.validateReminder(custom({ repeatMinutes: 121 })), /repeat/);
  assert.match(
    jobs.validateReminder(custom({ trigger: "at-time", atTime: "25:00" })),
    /time/,
  );
  assert.equal(
    jobs.validateReminder(custom({ trigger: "at-time", atTime: "12:05" })),
    null,
  );
});
test("duplicate reminder IDs are rejected", () => {
  assert.match(
    jobs.validateJob(
      job({ reminderSettings: settings({ custom: [custom(), custom()] }) }),
    ),
    /unique/,
  );
});
test("relative lunch reminder derives from the persisted clock-in timestamp", () => {
  const alert = jobs.jobAlerts(
    shift(),
    job({
      reminderSettings: settings({ lunchMode: "relative", lunchHours: 4 }),
    }),
  )[0];
  assert.equal(alert.at, Date.parse("2026-10-20T13:00:00"));
});
test("lunch reminder stops after lunch starts or a lunch duration has been recorded", () => {
  const profile = job({
    reminderSettings: settings({
      lunchMode: "relative",
      returnReminder: false,
    }),
  });
  assert.equal(jobs.jobAlerts(shift({ lunchMinutes: 30 }), profile).length, 0);
  assert.equal(
    jobs.jobAlerts(shift({ lunchStartedAt: "2026-10-20T12:00:00" }), profile)
      .length,
    0,
  );
});
test("return-to-work reminder uses configured lunch duration", () => {
  const alerts = jobs.jobAlerts(
    shift({ lunchStartedAt: "2026-10-20T12:00:00" }),
    job({ lunchMinutes: 45 }),
  );
  assert.equal(alerts[0].at, Date.parse("2026-10-20T12:45:00"));
});
test("fixed-time reminders use local wall-clock time and skip pre-clock-in times", () => {
  assert.equal(
    jobs.jobAlerts(
      shift(),
      job({
        reminderSettings: settings({ lunchMode: "fixed", lunchTime: "12:30" }),
      }),
    )[0].at,
    Date.parse("2026-10-20T12:30:00"),
  );
  assert.equal(
    jobs.jobAlerts(
      shift(),
      job({
        reminderSettings: settings({ lunchMode: "fixed", lunchTime: "08:00" }),
      }),
    ).length,
    0,
  );
});
test("custom rules honor all trigger modes and skip disabled reminders", () => {
  const profile = job({
    reminderSettings: settings({
      returnReminder: false,
      custom: [
        custom(),
        custom({
          id: "lunch",
          trigger: "after-lunch-start",
          offsetMinutes: 15,
        }),
        custom({ id: "at", trigger: "at-time", atTime: "14:00" }),
        custom({ id: "off", enabled: false }),
      ],
    }),
  });
  assert.equal(jobs.jobAlerts(shift(), profile).length, 2);
  const alerts = jobs.jobAlerts(
    shift({ lunchStartedAt: "2026-10-20T12:00:00" }),
    profile,
  );
  assert.equal(alerts.length, 3);
  assert.ok(
    alerts.some((item) => item.at === Date.parse("2026-10-20T12:15:00")),
  );
});
test("completed shifts never arm job reminders", () => {
  assert.equal(
    jobs.jobAlerts(
      shift({ endedAt: "2026-10-20T17:00:00" }),
      job({ reminderSettings: settings({ custom: [custom()] }) }),
    ).length,
    0,
  );
});
test("acknowledgements distinguish dismissal from snooze and persist through hydration", () => {
  const alert = jobs.jobAlerts(
    shift(),
    job({ reminderSettings: settings({ custom: [custom()] }) }),
  )[0];
  let state = reducer(
    initial,
    actions.acknowledgeJobReminder({ key: alert.key, nextAt: -1 }),
  );
  assert.equal(
    jobs.alertNextAt(alert, state.jobReminderAcknowledgements),
    null,
  );
  state = reducer(
    state,
    actions.acknowledgeJobReminder({
      key: alert.key,
      nextAt: alert.at + 600000,
    }),
  );
  const hydrated = reducer(
    initial,
    actions.hydrate(JSON.parse(JSON.stringify(state))),
  );
  assert.equal(
    jobs.alertNextAt(alert, hydrated.jobReminderAcknowledgements),
    alert.at + 600000,
  );
});
test("native queue is chronological, bounded to 48, and excludes dismissed rules", () => {
  const alerts = jobs.jobAlerts(
    shift(),
    job({
      reminderSettings: settings({
        custom: [
          custom({ repeatMinutes: 1 }),
          custom({ id: "second", offsetMinutes: 62 }),
        ],
      }),
    }),
  );
  const now = Date.parse("2026-10-20T09:59:00");
  const result = jobs.notificationTimes(alerts, {}, now);
  assert.equal(result.length, 48);
  assert.ok(result.every((item, i) => i === 0 || result[i - 1].at <= item.at));
  assert.equal(
    jobs.notificationTimes(
      alerts,
      Object.fromEntries(alerts.map((item) => [item.key, -1])),
      now,
    ).length,
    0,
  );
});
test("native repeat queue advances past stale times without a flood of immediate alerts", () => {
  const alerts = jobs.jobAlerts(
    shift(),
    job({
      reminderSettings: settings({ custom: [custom({ repeatMinutes: 10 })] }),
    }),
  );
  const now = Date.parse("2026-10-20T10:25:00");
  const result = jobs.notificationTimes(alerts, {}, now);
  assert.equal(result[0].at, Date.parse("2026-10-20T10:30:00"));
  assert.ok(result.every((item) => item.at > now));
});
test("job rate/currency and overtime feed History and Pay from the same profile", () => {
  const profile = job({
    hourlyRate: 20,
    currency: "EUR",
    overtimeThreshold: 6,
    overtimeMultiplier: 2,
  });
  const state = data({ jobs: [profile] });
  const entry = shift({ endedAt: "2026-10-20T17:00:00", currency: "EUR" });
  assert.equal(history.wagesFor(entry, state.jobs, state.todayPlan), 200);
  assert.equal(pay.shiftAmounts(entry, state).gross, 200);
});
test("next pay date determines the employer delay using calendar period boundaries", () => {
  const profile = jobs.normalizeJob(
    job({
      payFrequency: "weekly",
      payPeriodStart: "2026-10-19",
      nextPayDate: "2026-10-30",
    }),
  );
  assert.equal(profile.payDelayDays, 5);
  assert.equal(jobs.jobPayDelay({ ...profile, payDelayDays: 14 }), 14);
});
test("saved monthly pay delay does not drift over short months or DST", () => {
  const profile = jobs.normalizeJob(
    job({
      payFrequency: "monthly",
      payPeriodStart: "2026-01-31",
      nextPayDate: "2026-03-05",
    }),
  );
  assert.equal(profile.payDelayDays, 6);
});
test("reset plan respects the current job's lunch and overtime defaults", () => {
  const result = reducer(
    data({
      jobs: [job({ overtimeThreshold: 6, lunchMinutes: 45 })],
      selectedJobId: "work",
    }),
    actions.resetTodayPlan(),
  );
  assert.equal(result.todayPlan.hourlyRate, 30);
  assert.equal(result.todayPlan.overtimeThreshold, 6);
  assert.equal(result.todayPlan.lunchMinutes, 45);
});
test("the typed mock entitlement adapter keeps Free and Premium capabilities consistent", () => {
  const { entitlementsFor } = require("../src/services/entitlements.ts");
  assert.equal(entitlementsFor(initial).jobLimit, 1);
  assert.equal(entitlementsFor(initial).multipleSimultaneousJobs, false);
  assert.equal(entitlementsFor(data()).deductionsManager, true);
  assert.equal(entitlementsFor(data()).source, "mock");
});
