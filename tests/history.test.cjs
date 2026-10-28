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
const model = require("../src/features/history/model.ts");
const { payPeriod } = require("../src/features/history/payPeriods.ts");
const store = require("../src/store/appSlice.ts");
const { initialAppState: initial, appReducer: reducer } = store;
const { todayPlan: plan, jobs } = initial;
const draft = (changes = {}) => ({
  ...model.blankDraft("shift"),
  date: "2026-10-22",
  start: "09:00",
  end: "17:00",
  ...changes,
});
function build(changes = {}, existing) {
  const result = model.prepareEntry(draft(changes), jobs, plan, existing);
  assert.equal(result.ok, true, result.error);
  return result.entry;
}

test("adding a past shift or project preserves the active Tracker session", () => {
  const active = build();
  const state = { ...initial, activeShift: active };
  const after = reducer(
    state,
    store.addManualShift(build({ date: "2026-10-21" })),
  );
  assert.deepEqual(after.activeShift, active);
  assert.equal(after.history.length, 1);
  const project = build({
    entryType: "project",
    projectName: "Logo",
    flatAmount: "150",
    endDate: "2026-10-23",
  });
  assert.deepEqual(
    reducer(after, store.addManualShift(project)).activeShift,
    active,
  );
});
test("clock-out-only entries preserve the missing start and contribute zero hours", () => {
  const entry = build({ start: "", end: "17:00" });
  assert.equal(entry.startedAt, "");
  assert.equal(entry.missingClockIn, true);
  assert.equal(model.workedMinutes(entry), 0);
  assert.equal(entry.earnings, 0);
});
test("clock-in-only entry can be completed without inventing a clock-out", () => {
  const entry = build({ end: "" });
  assert.equal(entry.endedAt, null);
  assert.equal(model.workedMinutes(entry), 0);
  const corrected = model.prepareEntry(
    { ...model.draftForEntry(entry), end: "17:00" },
    jobs,
    plan,
    entry,
  );
  assert.equal(corrected.ok, true);
  assert.equal(corrected.entry.id, entry.id);
  assert.equal(model.workedMinutes(corrected.entry), 480);
});
test("editing without changes preserves legacy lunch duration, breaks, rate and notes", () => {
  const entry = build({
    lunchMinutes: "30",
    breakMinutes: "15",
    notes: "Night crew",
    customRate: "30",
    tips: "12",
    tipType: "paycheck",
  });
  const result = model.prepareEntry(
    model.draftForEntry(entry),
    jobs,
    plan,
    entry,
  );
  assert.equal(result.ok, true);
  assert.equal(result.entry.lunchMinutes, 30);
  assert.equal(result.entry.breakMinutes, 15);
  assert.equal(result.entry.earnings, 217.5);
  assert.equal(result.entry.projectNotes, "Night crew");
  assert.equal(result.entry.tipType, "paycheck");
});
test("editing recorded lunch times preserves both timestamps and deduction", () => {
  const entry = build({ lunchStart: "12:00", lunchEnd: "12:30" });
  const corrected = model.prepareEntry(
    model.draftForEntry(entry),
    jobs,
    plan,
    entry,
  );
  assert.equal(corrected.ok, true);
  assert.equal(corrected.entry.historyLunchStart, entry.historyLunchStart);
  assert.equal(corrected.entry.lunchMinutes, 30);
});
test("paid lunch adds paid hours while general breaks remain unpaid", () => {
  const entry = build({
    lunchMinutes: "30",
    lunchPaid: true,
    breakMinutes: "15",
  });
  assert.equal(model.workedMinutes(entry), 465);
  assert.equal(entry.earnings, 186);
});
test("job rate, custom rate and overtime thresholds affect wages", () => {
  const jobList = [
    { id: "night", name: "Night", hourlyRate: 30, color: "pink" },
  ];
  const value = model.prepareEntry(
    draft({ end: "19:00", jobId: "night" }),
    jobList,
    plan,
  );
  assert.equal(value.entry.earnings, 330);
  const custom = model.prepareEntry(
    draft({ end: "19:00", customRate: "40", jobId: "night" }),
    jobList,
    plan,
  );
  assert.equal(custom.entry.earnings, 440);
});
test("overnight shift supports lunch after midnight", () => {
  const entry = build({
    start: "22:00",
    end: "06:00",
    lunchStart: "02:00",
    lunchEnd: "02:30",
  });
  assert.equal(model.workedMinutes(entry), 450);
  assert.equal(entry.lunchMinutes, 30);
});
test("invalid dates, missing payout, invalid ranges and invalid amounts return errors", () => {
  for (const changes of [
    { date: "garbage" },
    { date: "2026-02-30" },
    { tips: "-1" },
    { start: "25:00" },
    { lunchStart: "12:00", lunchEnd: "" },
    { lunchMinutes: "500" },
    {
      entryType: "project",
      projectName: "Logo",
      flatAmount: "",
      endDate: "2026-10-22",
    },
    {
      entryType: "project",
      projectName: "Logo",
      flatAmount: "100",
      endDate: "2026-10-21",
    },
  ])
    assert.equal(
      model.prepareEntry(draft(changes), jobs, plan).ok,
      false,
      JSON.stringify(changes),
    );
});
test("projects retain payout, currency, job, notes and payment on edit", () => {
  const entry = build({
    entryType: "project",
    projectName: "Website, phase 1",
    flatAmount: "700",
    currency: "EUR",
    endDate: "2026-10-24",
    jobId: "default",
    notes: 'Client said "approved"',
    paid: true,
  });
  assert.equal(model.workedMinutes(entry), 0);
  assert.equal(model.wagesFor(entry, jobs, plan), 700);
  const corrected = model.prepareEntry(
    model.draftForEntry(entry),
    jobs,
    plan,
    entry,
  );
  assert.equal(corrected.ok, true);
  assert.equal(corrected.entry.currency, "EUR");
  assert.equal(corrected.entry.paid, true);
  assert.equal(corrected.entry.paidAt, entry.paidAt);
  assert.equal(corrected.entry.jobId, "default");
});
test("filter defaults and combined filters match client entry filtering", () => {
  assert.equal(model.defaultFilters().period, "all");
  const unpaid = build({ jobId: "default" });
  const paid = { ...unpaid, id: "paid", paid: true };
  const project = { ...unpaid, id: "project", entryType: "project" };
  const filters = {
    ...model.defaultFilters(),
    period: "custom",
    from: "2026-10-20",
    to: "2026-10-23",
    unpaidOnly: true,
    jobId: "default",
    type: "shifts",
  };
  assert.deepEqual(
    model
      .filterEntries([unpaid, paid, project], filters)
      .map((entry) => entry.id),
    [unpaid.id],
  );
  assert.equal(model.filterEntries([unpaid], filters, unpaid.id).length, 0);
  assert.equal(
    model.filterEntries([unpaid], { ...filters, from: "2026-10-24" }).length,
    0,
  );
});
test("week and last week filters use Monday boundaries", () => {
  const monday = build({ date: "2026-10-19" });
  const sunday = build({ date: "2026-10-18" });
  const now = new Date("2026-10-22T12:00:00");
  assert.deepEqual(
    model.filterEntries(
      [monday, sunday],
      { ...model.defaultFilters(), period: "week" },
      undefined,
      now,
    ),
    [monday],
  );
  assert.deepEqual(
    model.filterEntries(
      [monday, sunday],
      { ...model.defaultFilters(), period: "lastWeek" },
      undefined,
      now,
    ),
    [sunday],
  );
});
test("deduction frequencies count client History entries and job applicability", () => {
  const entries = [build(), build(), build({ date: "2026-10-30" })];
  const deduction = {
    id: "d",
    label: "Union",
    enabled: true,
    amount: 10,
    frequency: "daily",
  };
  assert.equal(model.periodDeductions([deduction], entries, null), 30);
  assert.equal(
    model.periodDeductions(
      [{ ...deduction, frequency: "weekly" }],
      entries,
      null,
    ),
    20,
  );
  assert.equal(
    model.periodDeductions(
      [{ ...deduction, frequency: "per-pay-period" }],
      entries,
      null,
    ),
    10,
  );
  assert.equal(
    model.periodDeductions(
      [{ ...deduction, jobId: "other" }],
      entries,
      "default",
    ),
    0,
  );
});
test("bulk paid action updates only requested eligible shifts", () => {
  const unpaid = { ...build(), id: "unpaid" };
  const untouched = { ...unpaid, id: "untouched" };
  const project = { ...unpaid, id: "project", entryType: "project" };
  const viaPaycheck = { ...unpaid, id: "paycheck", jobId: "paidJob" };
  const state = {
    ...initial,
    history: [unpaid, untouched, project, viaPaycheck],
    paychecks: [
      {
        id: "p",
        jobId: "paidJob",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        paid: true,
      },
    ],
  };
  const after = reducer(
    state,
    store.markHistoryPaidMany([unpaid.id, project.id, viaPaycheck.id]),
  );
  assert.deepEqual(
    after.history.map((entry) => Boolean(entry.paid)),
    [true, false, false, false],
  );
});
test("payment status and eligibility distinguish paycheck-covered and pending shifts", () => {
  const entry = build({ jobId: "default" });
  const checks = [
    {
      id: "p",
      jobId: "default",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      paid: true,
    },
  ];
  assert.equal(model.paymentStatus(entry, checks, jobs), "Paid via Paycheck");
  assert.equal(model.selectable(entry, checks, jobs), false);
  assert.equal(
    model.paymentStatus(entry, [], [{ ...jobs[0], payFrequency: "weekly" }]),
    "Pending Paycheck",
  );
});
test("live work excludes an ongoing lunch and does not accrue pay during it", () => {
  const entry = build({ end: "" });
  entry.lunchStartedAt = "2026-10-22T12:00:00";
  const noon = new Date("2026-10-22T12:00:00").getTime();
  assert.equal(model.workedMinutes(entry, noon), 180);
  assert.equal(model.workedMinutes(entry, noon + 1800000), 180);
});
test("resuming a history draft keeps its id and cannot replace an active shift", () => {
  const entry = build({ date: model.localDate(), start: "00:00", end: "" });
  const state = { ...initial, history: [entry] };
  const resumed = reducer(state, store.reactivateHistoryShift(entry.id));
  assert.equal(resumed.activeShift.id, entry.id);
  assert.equal(resumed.history.length, 0);
  const busy = { ...state, activeShift: { ...entry, id: "active" } };
  assert.equal(
    reducer(busy, store.reactivateHistoryShift(entry.id)).activeShift.id,
    "active",
  );
});
test("discard removes only the active draft and clears reminder identifiers", () => {
  const entry = build();
  const other = { ...entry, id: "other" };
  const state = {
    ...initial,
    activeShift: entry,
    history: [entry, other],
    scheduledLunchReminderId: "n1",
    scheduledReturnReminderId: "n2",
  };
  const after = reducer(state, store.discardActiveHistoryShift());
  assert.equal(after.activeShift, null);
  assert.deepEqual(after.history, [other]);
  assert.equal(after.scheduledLunchReminderId, null);
  assert.equal(after.scheduledReturnReminderId, null);
});
test("CSV escapes quotes and commas and projects contribute zero work minutes", () => {
  const entry = build({
    entryType: "project",
    projectName: 'Logo, "V2"',
    flatAmount: "100",
    endDate: "2026-10-24",
  });
  const csv = model.csvFor([entry], jobs, plan);
  assert.match(csv, /"Logo, ""V2"""/);
  assert.match(csv, /"0","100.00"/);
});
test("persisted state receives new History defaults on hydration", () => {
  const state = reducer(undefined, store.hydrate({ history: [build()] }));
  assert.deepEqual(state.paychecks, []);
  assert.equal(state.payVisible, true);
});
test("free History restricts the visible list without deleting older records", () => {
  const entries = [build(), build({ date: "2026-09-22" })];
  assert.equal(
    model.entitledEntries(entries, false, new Date("2026-10-22T12:00:00"))
      .length,
    1,
  );
  assert.equal(model.entitledEntries(entries, true).length, 2);
  assert.equal(entries.length, 2);
});
test("mock Premium preview can be entered and ended", () => {
  const premium = reducer(initial, store.setPremiumPreview(true));
  assert.equal(premium.isPremium, true);
  assert.equal(
    reducer(premium, store.setPremiumPreview(false)).isPremium,
    false,
  );
});
test("weekly and biweekly periods use the anchor and handle dates before it", () => {
  const job = {
    ...jobs[0],
    payPeriodStart: "2026-10-19",
    payFrequency: "weekly",
  };
  assert.deepEqual(payPeriod("2026-10-22", job), {
    start: "2026-10-19",
    end: "2026-10-25",
  });
  assert.deepEqual(payPeriod("2026-10-18", job), {
    start: "2026-10-12",
    end: "2026-10-18",
  });
  assert.deepEqual(
    payPeriod("2026-10-28", { ...job, payFrequency: "biweekly" }),
    { start: "2026-10-19", end: "2026-11-01" },
  );
});
test("monthly periods clamp month-end anchors and semi-monthly periods join correctly", () => {
  const job = {
    ...jobs[0],
    payPeriodStart: "2026-01-31",
    payFrequency: "monthly",
  };
  assert.deepEqual(payPeriod("2026-02-28", job), {
    start: "2026-02-28",
    end: "2026-03-30",
  });
  assert.deepEqual(
    payPeriod("2026-10-22", {
      ...job,
      payPeriodStart: "2026-01-01",
      payFrequency: "semi-monthly",
    }),
    { start: "2026-10-16", end: "2026-10-31" },
  );
  assert.equal(payPeriod("2026-10-22", jobs[0]), null);
});
