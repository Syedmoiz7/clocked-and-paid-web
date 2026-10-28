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
const pay = require("../src/features/pay/model.ts");
const history = require("../src/features/history/model.ts");
const actions = require("../src/store/appSlice.ts");
const initial = actions.initialAppState;
const reducer = actions.appReducer;
const bounds = { start: "2026-10-01", end: "2026-10-31" };
function shift(changes = {}) {
  return {
    id: "shift",
    date: "2026-10-20",
    startedAt: "2026-10-20T09:00:00",
    endedAt: "2026-10-20T17:00:00",
    lunchMinutes: 0,
    breakMinutes: 0,
    earnings: 192,
    jobId: "default",
    ...changes,
  };
}
function data(changes = {}) {
  return { ...initial, ...changes };
}
function deduction(changes = {}) {
  return {
    id: "ded",
    label: "Insurance",
    amount: 100,
    frequency: "per-pay-period",
    enabled: true,
    ...changes,
  };
}
function receipt(changes = {}) {
  return {
    id: "receipt",
    jobId: "default",
    startDate: "2026-10-01",
    endDate: "2026-10-14",
    payDate: "2026-10-21",
    paid: true,
    grossPay: 1000,
    totalDeductions: 200,
    netPay: 800,
    currency: "USD",
    ...changes,
  };
}
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);

test("range presets include exactly seven/thirty/ninety local calendar days", () => {
  assert.deepEqual(pay.rangeBounds("last7", [], "2026-10-22"), {
    start: "2026-10-16",
    end: "2026-10-22",
  });
  assert.deepEqual(pay.rangeBounds("last30", [], "2026-10-22"), {
    start: "2026-09-23",
    end: "2026-10-22",
  });
  assert.equal(
    pay.daysBetween(
      pay.rangeBounds("last90", [], "2026-10-22").start,
      "2026-10-22",
    ),
    89,
  );
  assert.equal(
    pay.rangeBounds("thisWeek", [], "2026-10-25").start,
    "2026-10-19",
  );
});
test("local date arithmetic is stable across DST", () => {
  assert.equal(pay.daysBetween("2026-03-07", "2026-03-10"), 3);
  assert.equal(pay.daysBetween("2026-10-31", "2026-11-03"), 3);
});
test("schedule frequency and delay yield valid expected dates", () => {
  const schedule = pay.scheduleFor("weekly", "2026-10-19", 3);
  assert.equal(schedule.periodEnd, "2026-10-25");
  assert.equal(schedule.payDate, "2026-10-28");
  assert.equal(pay.validateSchedule(schedule), null);
  assert.notEqual(
    pay.validateSchedule({ ...schedule, payDate: "2026-10-24" }),
    null,
  );
});
test("monthly navigation retains the original month-end anchor", () => {
  const january = pay.scheduleFor("monthly", "2026-01-31", 7);
  const february = pay.moveSchedule(january, 1);
  const march = pay.moveSchedule(february, 1);
  assert.equal(february.periodStart, "2026-02-28");
  assert.equal(march.periodStart, "2026-03-31");
  assert.equal(pay.moveSchedule(march, -1).periodStart, "2026-02-28");
});
test("custom periods shift without gaps or overlaps", () => {
  const custom = {
    ...pay.scheduleFor("weekly", "2026-10-01"),
    periodEnd: "2026-10-10",
    customPeriod: true,
  };
  const next = pay.moveSchedule(custom, 1);
  assert.equal(next.periodStart, "2026-10-11");
  assert.equal(next.periodEnd, "2026-10-20");
  assert.equal(pay.moveSchedule(next, -1).periodStart, "2026-10-01");
});
test("cash tips are separate from gross; paycheck tips are included", () => {
  const state = data();
  const cash = pay.shiftAmounts(shift({ tips: 20, tipType: "cash" }), state);
  const check = pay.shiftAmounts(
    shift({ tips: 20, tipType: "paycheck" }),
    state,
  );
  assert.equal(cash.gross, 192);
  assert.equal(cash.cashTips, 20);
  assert.equal(check.gross, 212);
  assert.equal(check.cashTips, 0);
});
test("Pay respects job overtime overrides, paid lunch and unpaid breaks", () => {
  const state = data({
    jobs: [
      {
        ...initial.jobs[0],
        hourlyRate: 30,
        overtimeThreshold: 6,
        overtimeMultiplier: 2,
      },
    ],
  });
  const result = pay.shiftAmounts(
    shift({ lunchMinutes: 30, lunchPaid: true, breakMinutes: 30 }),
    state,
  );
  assert.equal(result.minutes, 450);
  assert.equal(result.gross, 270);
});
test("projects contribute flat payout and zero work hours", () => {
  const result = pay.shiftAmounts(
    shift({ entryType: "project", flatAmount: 500 }),
    data(),
  );
  assert.equal(result.gross, 500);
  assert.equal(result.minutes, 0);
});
test("incomplete shifts do not enter paycheck estimation", () => {
  const state = data({
    history: [
      shift({ endedAt: null }),
      shift({ id: "outOnly", missingClockIn: true, startedAt: "" }),
      shift({ id: "complete" }),
    ],
  });
  assert.deepEqual(
    pay
      .periodEntries(state, bounds, null, "USD", true)
      .map((entry) => entry.id),
    ["complete"],
  );
});
test("different currencies are never summed in a financial summary", () => {
  const state = data({
    history: [shift(), shift({ id: "eur", currency: "EUR" })],
  });
  assert.equal(pay.financialSummary(state, bounds, null, "USD").gross, 192);
  assert.equal(pay.financialSummary(state, bounds, null, "EUR").gross, 192);
});
test("no-history estimate uses labeled 25% fallback and zero earnings stay zero", () => {
  const empty = pay.financialSummary(data(), bounds, null, "USD");
  assert.equal(empty.deductions, 0);
  const result = pay.financialSummary(
    data({ history: [shift()] }),
    bounds,
    null,
    "USD",
  );
  assert.equal(result.deductions, 48);
  assert.equal(result.net, 144);
  assert.equal(result.estimate.source, "fallback");
  assert.match(result.estimate.label, /25%/);
});
test("cash tips remain separate from paycheck take-home", () => {
  const result = pay.financialSummary(
    data({ history: [shift({ tips: 20, tipType: "cash" })] }),
    bounds,
    null,
    "USD",
  );
  assert.equal(result.gross, 192);
  assert.equal(result.cashTips, 20);
  assert.equal(result.takeHome, 144);
});
test("flat recurring deductions prorate annual amount over inclusive calendar days", () => {
  const item = deduction({ amount: 1200, frequency: "yearly" });
  close(
    pay.deductionAmount(item, 1000, new Map(), {
      start: "2026-10-01",
      end: "2026-10-31",
    }),
    (1200 * 31) / 365,
  );
});
test("bounded snapshot is assigned only to the period containing its end date", () => {
  const item = deduction({
    applicableFromDate: "2026-10-10",
    applicableToDate: "2026-10-23",
  });
  assert.equal(
    pay.deductionAmount(item, 1000, new Map(), {
      start: "2026-10-01",
      end: "2026-10-14",
    }),
    0,
  );
  assert.equal(
    pay.deductionAmount(item, 1000, new Map(), {
      start: "2026-10-15",
      end: "2026-10-28",
    }),
    100,
  );
});
test("one-time deductions are not reused after consumption", () => {
  const item = deduction({
    frequency: "one-time",
    consumedByPaycheckId: "receipt",
  });
  assert.equal(pay.deductionAmount(item, 1000, new Map(), bounds), 0);
  const estimated = pay.estimateDeductions(
    data({ deductions: [item] }),
    bounds,
    "default",
    new Map([["default", 1000]]),
    "USD",
  );
  assert.equal(estimated.total, 0);
});
test("job-scoped percentages use only that job's gross", () => {
  const item = deduction({ jobId: "other", isPercentage: true, amount: 10 });
  assert.equal(
    pay.deductionAmount(
      item,
      1000,
      new Map([
        ["default", 800],
        ["other", 200],
      ]),
      bounds,
    ),
    20,
  );
});
test("global flat deductions are charged once across multiple jobs", () => {
  const state = data({
    jobs: [...initial.jobs, { ...initial.jobs[0], id: "other" }],
    deductions: [deduction({ frequency: "one-time", amount: 50 })],
  });
  const estimate = pay.estimateDeductions(
    state,
    bounds,
    null,
    new Map([
      ["default", 500],
      ["other", 500],
    ]),
    "USD",
  );
  assert.equal(estimate.total, 50);
});
test("historical deduction rates use valid confirmed records and resist outliers", () => {
  const records = [20, 20, 20, 20, 20, 90].map((rate, index) =>
    receipt({ id: String(index), netPay: 1000 - rate * 10 }),
  );
  const result = pay.historicalRate(records, "default", "USD");
  assert.equal(result.rate, 0.2);
  assert.equal(result.count, 5);
  assert.equal(result.excluded, 1);
  assert.equal(
    pay.historicalRate(
      [receipt({ grossPay: 0 }), receipt({ netPay: 2000 })],
      "default",
      "USD",
    ),
    null,
  );
});
test("historical estimates take priority and configured preference overrides them", () => {
  const state = data({
    paychecks: [receipt()],
    deductions: [deduction({ isPercentage: true, amount: 10 })],
  });
  const values = new Map([["default", 1000]]);
  assert.equal(
    pay.estimateDeductions(state, bounds, "default", values, "USD").total,
    200,
  );
  assert.equal(
    pay.estimateDeductions(state, bounds, "default", values, "USD", true).total,
    100,
  );
});
test("confirmed deductions do not erase estimates for later unreceived earnings at the same job", () => {
  const entry = shift({ date: "2026-10-10", id: "covered" });
  const later = shift({ id: "later" });
  const state = data({
    history: [entry, later],
    paychecks: [
      receipt({ grossPay: 192, totalDeductions: 19.2, netPay: 172.8 }),
    ],
  });
  const result = pay.financialSummary(state, bounds, "default", "USD");
  close(result.deductions, 38.4);
  assert.equal(result.paid, 192);
  assert.equal(result.outstanding, 192);
});
test("live pay appears once and stops accruing during an unpaid lunch", () => {
  const active = shift({
    endedAt: null,
    lunchStartedAt: "2026-10-20T12:00:00",
  });
  const state = data({ activeShift: active, history: [active] });
  const now = new Date("2026-10-20T12:30:00").getTime();
  const result = pay.financialSummary(state, bounds, null, "USD", now);
  assert.equal(result.gross, 72);
  assert.equal(result.count, 1);
  assert.equal(result.minutes, 180);
});
test("paycheck period queries exclude projects and tips paid in cash", () => {
  const state = data({
    history: [
      shift({ tips: 20, tipType: "cash" }),
      shift({ id: "project", entryType: "project", flatAmount: 500 }),
    ],
  });
  const result = pay.paycheckDraft(state, "default", bounds);
  assert.equal(result.gross, 192);
  assert.equal(result.entries.length, 1);
});
test("deduction validator rejects invalid names, percentages and date ranges", () => {
  assert.notEqual(pay.validateDeduction(deduction({ label: "" })), null);
  assert.notEqual(
    pay.validateDeduction(deduction({ isPercentage: true, amount: 101 })),
    null,
  );
  assert.notEqual(
    pay.validateDeduction(
      deduction({
        applicableFromDate: "2026-10-20",
        applicableToDate: "2026-10-01",
      }),
    ),
    null,
  );
  assert.equal(
    pay.validateDeduction(deduction({ isPercentage: true, amount: 0 })),
    null,
  );
});
test("receipt validation accepts zero amounts and rejects impossible amounts/dates", () => {
  assert.equal(
    pay.validateReceipt(
      receipt({ grossPay: 0, totalDeductions: 0, netPay: 0 }),
    ),
    null,
  );
  assert.notEqual(
    pay.validateReceipt(receipt({ totalDeductions: 1001 })),
    null,
  );
  assert.notEqual(
    pay.validateReceipt(receipt({ payDate: "2026-02-30" })),
    null,
  );
});
test("recording a paycheck marks only eligible unpaid covered shifts", () => {
  const unpaid = shift({ date: "2026-10-10" });
  const prePaid = shift({ id: "manual", date: "2026-10-10", paid: true });
  const out = shift({ id: "out" });
  const state = data({
    history: [unpaid, prePaid, out],
    deductions: [deduction({ frequency: "one-time" })],
  });
  const record = receipt();
  const after = reducer(
    state,
    actions.recordPaycheck({
      paycheck: record,
      markShifts: true,
      consumeDeductionIds: ["ded"],
    }),
  );
  assert.equal(after.history[0].paidByPaycheckId, record.id);
  assert.equal(after.history[1].paidByPaycheckId, undefined);
  assert.equal(after.history[2].paid, undefined);
  assert.equal(after.deductions[0].consumedByPaycheckId, record.id);
  assert.equal(
    history.paymentStatus(unpaid, after.paychecks, after.jobs),
    "Paid via Paycheck",
  );
});
test("undo receipt restores only its owned shift payments and consumed deductions", () => {
  const state = data({
    history: [
      shift({ id: "owned", paid: true, paidByPaycheckId: "receipt" }),
      shift({ id: "manual", paid: true }),
    ],
    deductions: [deduction({ consumedByPaycheckId: "receipt" })],
    paychecks: [receipt()],
  });
  const after = reducer(state, actions.deletePaycheck("receipt"));
  assert.equal(after.history[0].paid, false);
  assert.equal(after.history[1].paid, true);
  assert.equal(after.deductions[0].consumedByPaycheckId, undefined);
  assert.equal(after.paychecks.length, 0);
});
test("overlapping paycheck receipts cannot be double-recorded", () => {
  const state = data({ paychecks: [receipt()] });
  const after = reducer(
    state,
    actions.recordPaycheck({
      paycheck: receipt({
        id: "new",
        startDate: "2026-10-10",
        endDate: "2026-10-20",
      }),
      markShifts: true,
      consumeDeductionIds: [],
    }),
  );
  assert.equal(after.paychecks.length, 1);
});
test("schedules persist by scope and optionally update the selected job only", () => {
  const schedule = pay.scheduleFor("weekly", "2026-10-19");
  const after = reducer(
    initial,
    actions.savePaySchedule({ scope: "default", schedule, applyToJob: true }),
  );
  assert.equal(after.paySchedules.default.periodStart, "2026-10-19");
  assert.equal(after.jobs[0].payFrequency, "weekly");
  const estimator = reducer(
    initial,
    actions.savePaySchedule({ scope: "__all__", schedule, applyToJob: false }),
  );
  assert.equal(estimator.jobs[0].payFrequency, undefined);
});
test("projection excludes one-time rules and annualizes snapshots once", () => {
  const rules = [
    deduction({
      id: "a",
      amount: 100,
      applicableFromDate: "2026-09-01",
      applicableToDate: "2026-09-14",
    }),
    deduction({
      id: "b",
      amount: 100,
      applicableFromDate: "2026-09-15",
      applicableToDate: "2026-09-28",
    }),
    deduction({ id: "one", amount: 999, frequency: "one-time" }),
  ];
  assert.equal(
    pay.projectedDeductions(data({ deductions: rules }), null, 0, "2026-10-22")
      .annual,
    2600,
  );
});
test("new Pay fields hydrate with defaults for an older saved app state", () => {
  const saved = reducer(undefined, actions.hydrate({ history: [shift()] }));
  assert.deepEqual(saved.paySchedules, {});
  assert.equal(saved.history.length, 1);
});
test("tax set-asides separate net pay from take-home without double subtraction", () => {
  const state = data({
    history: [shift()],
    deductions: [
      deduction({
        frequency: "one-time",
        amount: 20,
        taxSetAside: true,
        applicableFromDate: bounds.start,
        applicableToDate: bounds.end,
      }),
    ],
  });
  const summary = pay.financialSummary(state, bounds, null, "USD");
  assert.equal(summary.deductions, 20);
  assert.equal(summary.taxSetAside, 20);
  assert.equal(summary.net, 192);
  assert.equal(summary.takeHome, 172);
});
test("percentage deduction projection respects each job's annual gross", () => {
  const state = data({
    deductions: [
      deduction({ jobId: "default", isPercentage: true, amount: 10 }),
    ],
  });
  assert.equal(
    pay.projectedDeductions(
      state,
      null,
      100000,
      "2026-10-22",
      new Map([["default", 20000]]),
    ).annual,
    2000,
  );
});
test("one-time deduction validation requires both dates", () => {
  assert.notEqual(
    pay.validateDeduction(deduction({ frequency: "one-time" })),
    null,
  );
  assert.equal(
    pay.validateDeduction(
      deduction({
        frequency: "one-time",
        applicableFromDate: bounds.start,
        applicableToDate: bounds.end,
      }),
    ),
    null,
  );
});
test("separate jobs keep separate historical withholding rates", () => {
  const state = data({
    paychecks: [
      receipt(),
      receipt({
        id: "other",
        jobId: "other",
        totalDeductions: 100,
        netPay: 900,
      }),
    ],
  });
  const estimate = pay.estimateDeductions(
    state,
    bounds,
    null,
    new Map([
      ["default", 500],
      ["other", 500],
    ]),
    "USD",
  );
  assert.equal(estimate.total, 150);
});
test("receipt amounts must be internally consistent", () => {
  assert.notEqual(pay.validateReceipt(receipt({ netPay: 500 })), null);
});
test("past bounded deduction snapshots scale to current gross using historical earnings", () => {
  const state = data({
    history: [shift({ date: "2026-10-10", id: "past" })],
    deductions: [
      deduction({
        amount: 48,
        jobId: "default",
        applicableFromDate: "2026-10-01",
        applicableToDate: "2026-10-14",
      }),
    ],
  });
  const result = pay.estimateDeductions(
    state,
    { start: "2026-10-15", end: "2026-10-28" },
    "default",
    new Map([["default", 384]]),
    "USD",
  );
  assert.equal(result.total, 96);
});
test("History-created shifts inherit job currency and overtime rules used by Pay", () => {
  const jobs = [
    {
      ...initial.jobs[0],
      currency: "EUR",
      hourlyRate: 30,
      overtimeThreshold: 6,
      overtimeMultiplier: 2,
    },
  ];
  const draft = {
    ...history.blankDraft("shift"),
    date: "2026-10-20",
    start: "09:00",
    end: "17:00",
    jobId: "default",
  };
  const result = history.prepareEntry(draft, jobs, initial.todayPlan);
  assert.equal(result.ok, true);
  assert.equal(result.entry.currency, "EUR");
  assert.equal(result.entry.earnings, 300);
  assert.equal(
    pay.financialSummary(
      data({ jobs, history: [result.entry] }),
      bounds,
      "default",
      "EUR",
    ).gross,
    300,
  );
});
test("explicit manual payment edits detach a receipt's undo ownership", () => {
  const state = data({
    history: [shift({ paid: false, paidByPaycheckId: "receipt" })],
    paychecks: [receipt()],
  });
  const manuallyPaid = reducer(
    state,
    actions.updateHistoryShift({ id: "shift", changes: { paid: true } }),
  );
  assert.equal(manuallyPaid.history[0].paidByPaycheckId, null);
  assert.equal(
    reducer(manuallyPaid, actions.deletePaycheck("receipt")).history[0].paid,
    true,
  );
});
