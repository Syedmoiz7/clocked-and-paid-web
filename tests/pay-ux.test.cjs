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
const store = require("../src/store/appSlice.ts");
const backup = require("../src/features/settings/backup.ts");
const { commitWorkspaceAction } = require("../src/services/commitWorkspace.ts");
const { initialAppState: initial, appReducer: reduce } = store;
const bounds = { start: "2026-10-01", end: "2026-10-31" };
const job = { ...initial.jobs[0], id: "usd", hourlyRate: 100, currency: "USD" };
const other = { ...job, id: "other" };
const data = (changes) => ({
  ...initial,
  jobs: [job, other],
  history: [],
  deductions: [],
  paychecks: [],
  ...changes,
});
const shift = (id = "work", changes = {}) => ({
  id,
  date: "2026-10-20",
  startedAt: "2026-10-20T09:00:00",
  endedAt: "2026-10-20T10:00:00",
  lunchMinutes: 0,
  breakMinutes: 0,
  earnings: 0,
  jobId: "usd",
  currency: "USD",
  ...changes,
});
const deduction = (changes) => ({
  id: "fee",
  label: "Fee",
  frequency: "monthly",
  amount: 10,
  enabled: true,
  ...changes,
});
const receipt = (changes) => ({
  id: "receipt",
  jobId: "usd",
  startDate: "2026-10-01",
  endDate: "2026-10-14",
  payDate: "2026-10-20",
  paid: true,
  grossPay: 100,
  totalDeductions: 20,
  netPay: 80,
  currency: "USD",
  ...changes,
});
const estimate = (
  state,
  values = new Map([["usd", 100]]),
  currency = "USD",
  prefer = true,
) => pay.estimateDeductions(state, bounds, null, values, currency, prefer);
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);

test("Pay aggregates primary/additional live work, tips, overtime and per-job rows exactly once", () => {
  const active = shift("active", {
    endedAt: null,
    tips: 10,
    tipType: "cash",
    overtimeThreshold: 0.5,
    overtimeMultiplier: 2,
  });
  const extra = shift("extra", {
    endedAt: null,
    jobId: "other",
    tips: 5,
    tipType: "paycheck",
  });
  const state = data({
    activeShift: active,
    extraShifts: [extra],
    history: [active, extra],
  });
  const result = pay.financialSummary(
    state,
    bounds,
    null,
    "USD",
    new Date("2026-10-20T10:00:00").getTime(),
  );
  assert.equal(result.gross, 255);
  assert.equal(result.cashTips, 10);
  assert.equal(result.minutes, 120);
  assert.equal(result.overtime, 30);
  assert.equal(result.count, 2);
  assert.equal(result.liveCount, 2);
  assert.equal(result.rows.length, 2);
  assert.equal(result.daysWorked, 1);
  assert.equal(result.paid, 0);
  assert.equal(result.outstanding, 255);
});
test("job, date and currency filters exclude unrelated additional running shifts", () => {
  const active = shift("active", { endedAt: null });
  const extra = shift("extra", {
    jobId: "other",
    endedAt: null,
    currency: "EUR",
  });
  const state = data({ activeShift: active, extraShifts: [extra] });
  const now = new Date("2026-10-20T10:00:00").getTime();
  assert.equal(pay.financialSummary(state, bounds, null, "EUR", now).count, 1);
  assert.equal(pay.financialSummary(state, bounds, "usd", "EUR", now).count, 0);
  assert.equal(
    pay.financialSummary(
      state,
      { start: "2026-10-01", end: "2026-10-19" },
      null,
      "USD",
      now,
    ).count,
    0,
  );
});
test("completed-only previews exclude every running record and duplicate history copy", () => {
  const extra = shift("extra", { endedAt: null });
  const state = data({
    extraShifts: [extra],
    history: [{ ...extra, endedAt: "2026-10-20T10:00:00" }],
  });
  assert.equal(pay.periodEntries(state, bounds, null, "USD").length, 0);
  assert.equal(
    pay.financialSummary(state, bounds, null, "USD", Date.now(), false, false)
      .count,
    0,
  );
});
test("a receipt in a different currency neither marks tracked earnings received nor replaces deductions", () => {
  const state = data({
    history: [shift("covered", { date: "2026-10-10" })],
    paychecks: [receipt({ currency: "EUR" })],
  });
  const result = pay.financialSummary(state, bounds, "usd", "USD");
  assert.equal(result.paid, 0);
  assert.equal(result.confirmedCount, 0);
  assert.equal(result.deductions, 25);
});
test("receipts without matching tracked work cannot subtract deductions from another job", () => {
  const state = data({
    history: [shift()],
    paychecks: [receipt({ jobId: "other", totalDeductions: 90, netPay: 10 })],
  });
  assert.equal(
    pay.financialSummary(state, bounds, null, "USD").confirmedCount,
    0,
  );
});
test("global fixed deductions never change currency with the display filter", () => {
  const state = data({
    deductions: [deduction({ amount: 50, frequency: "one-time" })],
  });
  assert.equal(
    pay.deductionCurrencyMatches(state.deductions[0], state, "EUR"),
    false,
  );
  const result = estimate(state, new Map([["usd", 100]]), "EUR");
  assert.equal(result.total, 25);
  assert.equal(result.source, "fallback");
});
test("fixed rules for jobs with no earnings cannot charge another job's pay", () => {
  const state = data({
    deductions: [
      deduction({ jobId: "other", amount: 50, frequency: "one-time" }),
    ],
  });
  assert.equal(estimate(state).total, 25);
  assert.equal(
    estimate(
      state,
      new Map([
        ["usd", 100],
        ["other", 0],
      ]),
    ).total,
    25,
  );
});
test("saved fixed rules do not double-charge on top of historical withholding", () => {
  const state = data({
    paychecks: [receipt()],
    deductions: [deduction({ amount: 50, frequency: "one-time" })],
  });
  assert.equal(estimate(state, undefined, "USD", false).total, 20);
});
test("bounded percentages use only earnings inside their date scope", () => {
  const state = data({
    history: [shift("early", { date: "2026-10-10" }), shift("late")],
    deductions: [
      deduction({
        isPercentage: true,
        amount: 10,
        applicableFromDate: "2026-10-15",
        applicableToDate: "2026-10-31",
      }),
    ],
  });
  assert.equal(estimate(state, new Map([["usd", 200]])).total, 10);
});
test("expired/future percentages are not charged or treated as old flat-dollar snapshots", () => {
  for (const dates of [
    { applicableFromDate: "2026-11-01", applicableToDate: "2026-11-30" },
    { applicableFromDate: "2026-09-01", applicableToDate: "2026-09-30" },
  ]) {
    const state = data({
      deductions: [deduction({ isPercentage: true, amount: 10, ...dates })],
    });
    assert.equal(estimate(state).total, 0);
    assert.equal(
      pay.deductionAmount(state.deductions[0], 100, new Map(), bounds),
      0,
    );
  }
});
test("historical snapshot estimates exclude other-currency rules", () => {
  const state = data({
    jobs: [job, { ...other, currency: "EUR" }],
    history: [shift("past", { date: "2026-09-10" })],
    deductions: [
      deduction({
        jobId: "other",
        amount: 90,
        applicableFromDate: "2026-09-01",
        applicableToDate: "2026-09-30",
      }),
    ],
  });
  assert.equal(
    pay.configuredHistoricalRate(state, null, "USD", bounds.start),
    null,
  );
});
test("mixed estimates label temporary fallback instead of claiming all jobs use saved rules", () => {
  const state = data({
    deductions: [deduction({ jobId: "usd", isPercentage: true, amount: 10 })],
  });
  const result = estimate(
    state,
    new Map([
      ["usd", 100],
      ["other", 100],
    ]),
  );
  assert.equal(result.total, 35);
  assert.match(result.label, /temporary 25%/);
});
test("shared history samples are counted once even when reused for several jobs", () => {
  const state = data({ paychecks: [receipt()] });
  const result = estimate(
    state,
    new Map([
      ["usd", 100],
      ["other", 100],
    ]),
    "USD",
    false,
  );
  assert.equal(result.total, 40);
  assert.equal(result.count, 1);
});
test("fixed estimates for uncovered work are weighted once when receipts replace covered work", () => {
  const state = data({
    history: [shift("covered", { date: "2026-10-10" }), shift("later")],
    paychecks: [receipt()],
    deductions: [deduction({ jobId: "usd", frequency: "yearly", amount: 365 })],
  });
  const result = pay.financialSummary(
    state,
    bounds,
    "usd",
    "USD",
    Date.now(),
    true,
  );
  close(result.deductions, 35.5);
});
test("tax set-asides cannot make net pay exceed gross after deduction capping", () => {
  const state = data({
    history: [shift()],
    deductions: [
      deduction({ taxSetAside: true, isPercentage: true, amount: 200 }),
    ],
  });
  const result = pay.financialSummary(
    state,
    bounds,
    "usd",
    "USD",
    Date.now(),
    true,
  );
  assert.ok(result.taxSetAside <= result.deductions);
  assert.ok(result.net <= result.gross);
  assert.equal(result.takeHome, 0);
});
test("dated percentages on uncovered work do not get diluted by already-confirmed entries", () => {
  const state = data({
    history: [shift("covered", { date: "2026-10-10" }), shift("later")],
    paychecks: [receipt()],
    deductions: [
      deduction({
        isPercentage: true,
        amount: 10,
        applicableFromDate: "2026-10-15",
        applicableToDate: "2026-10-31",
      }),
    ],
  });
  assert.equal(
    pay.financialSummary(state, bounds, "usd", "USD", Date.now(), true)
      .deductions,
    30,
  );
});
test("bounded percentage projections are percentage rates, not flat period snapshots", () => {
  const state = data({
    deductions: [
      deduction({
        isPercentage: true,
        frequency: "per-pay-period",
        amount: 10,
        applicableFromDate: "2026-10-01",
        applicableToDate: "2026-10-31",
      }),
    ],
  });
  assert.equal(
    pay.projectedDeductions(state, null, 12000, "2026-10-20").annual,
    1200,
  );
});
test("summary never borrows an unrelated job's pay period", () => {
  const state = data({
    jobs: [
      { ...job, payFrequency: "weekly", payPeriodStart: "2026-10-19" },
      other,
    ],
  });
  assert.equal(pay.payViewSchedule(state, null, "2026-10-26"), null);
  assert.equal(pay.payViewSchedule(state, "other", "2026-10-26"), null);
});
test("saved Pay window wins over job defaults without mutating the job", () => {
  const custom = {
    ...pay.scheduleFor("weekly", "2026-10-01"),
    periodEnd: "2026-10-10",
    payDate: "2026-10-17",
    customPeriod: true,
  };
  const state = data({
    jobs: [{ ...job, payFrequency: "monthly", payPeriodStart: "2026-01-31" }],
    paySchedules: { usd: custom },
  });
  assert.deepEqual(pay.payViewSchedule(state, "usd"), custom);
  const after = reduce(
    state,
    store.savePaySchedule({ scope: "usd", schedule: custom, applyToJob: true }),
  );
  assert.equal(after.jobs[0].payFrequency, "monthly");
});
test("current-period reset advances old/custom windows and preserves month-end anchors", () => {
  const monthly = pay.currentPaySchedule(
    pay.scheduleFor("monthly", "2026-01-31"),
    "2026-03-31",
  );
  assert.equal(monthly.periodStart, "2026-03-31");
  const custom = {
    ...pay.scheduleFor("weekly", "2026-10-01"),
    periodEnd: "2026-10-10",
    customPeriod: true,
  };
  const current = pay.currentPaySchedule(custom, "2026-10-26");
  assert.equal(current.periodStart, "2026-10-21");
  assert.equal(current.periodEnd, "2026-10-30");
});
test("selecting an unchanged schedule field preserves custom dates and anchors", () => {
  const current = pay.moveSchedule(pay.scheduleFor("monthly", "2026-01-31"), 1);
  assert.equal(
    pay.editSchedule(current, "periodStart", current.periodStart),
    current,
  );
  assert.equal(
    pay.editSchedule(current, "frequency", current.frequency),
    current,
  );
  assert.equal(
    pay.editSchedule(current, "periodEnd", current.periodEnd),
    current,
  );
});
test("schedule edits reset dependent dates or recompute delay without conflicting values", () => {
  const original = pay.scheduleFor("weekly", "2026-10-01", 3);
  const custom = pay.editSchedule(original, "periodEnd", "2026-10-10");
  assert.equal(custom.payDate, "2026-10-13");
  assert.equal(custom.customPeriod, true);
  assert.equal(
    pay.editSchedule(custom, "frequency", "biweekly").customPeriod,
    undefined,
  );
  assert.equal(
    pay.editSchedule(custom, "payDate", "2026-10-15").payDelayDays,
    5,
  );
  assert.ok(pay.validateSchedule({ ...original, payDelayDays: 99 }));
});
test("manual override rejects blank, negative, nonfinite, over-gross and over-100 inputs", () => {
  for (const [type, value] of [
    ["amount", ""],
    ["amount", "-1"],
    ["amount", "Infinity"],
    ["amount", "101"],
    ["percent", "101"],
  ]) {
    const result = pay.manualDeduction(100, type, value);
    assert.ok(result.error);
    assert.equal(result.amount, null);
  }
  assert.equal(pay.manualDeduction(100, "percent", "20").amount, 20);
  assert.equal(pay.manualDeduction(0, "amount", "0").amount, 0);
});
test("new received paychecks reject future receive dates while legacy backups remain readable", () => {
  const future = receipt({ payDate: "2026-10-30" });
  assert.equal(pay.validateReceipt(future), null);
  assert.match(pay.receiptError(data(), future, "2026-10-26"), /future/);
  assert.equal(pay.receiptError(data(), receipt(), "2026-10-26"), null);
});
test("overlapping receipts are isolated by currency and paid status", () => {
  const state = data({ paychecks: [receipt()] });
  assert.ok(pay.receiptError(state, receipt({ id: "dup" }), "2026-10-26"));
  assert.equal(
    pay.receiptError(
      state,
      receipt({ id: "euro", currency: "EUR" }),
      "2026-10-26",
    ),
    null,
  );
  assert.equal(
    pay.receiptError(
      data({ paychecks: [receipt({ paid: false })] }),
      receipt({ id: "new" }),
      "2026-10-26",
    ),
    null,
  );
});
test("recording a receipt marks and consumes only matching-currency work and deductions", () => {
  const state = data({
    history: [
      shift("usd", { date: "2026-10-10" }),
      shift("eur", { date: "2026-10-10", currency: "EUR" }),
    ],
    deductions: [
      deduction({
        frequency: "one-time",
        applicableFromDate: bounds.start,
        applicableToDate: bounds.end,
      }),
    ],
  });
  const record = receipt({ currency: "EUR", endDate: bounds.end });
  assert.deepEqual(pay.consumptionIds(state, record), []);
  const after = reduce(
    state,
    store.recordPaycheck({
      paycheck: record,
      markShifts: true,
      consumeDeductionIds: ["fee"],
    }),
  );
  assert.equal(after.history[0].paid, undefined);
  assert.equal(after.history[1].paid, true);
  assert.equal(after.deductions[0].consumedByPaycheckId, undefined);
});
test("recording rejects impossible amounts at the reducer boundary", () => {
  const state = data();
  const after = reduce(
    state,
    store.recordPaycheck({
      paycheck: receipt({ netPay: 999 }),
      markShifts: true,
      consumeDeductionIds: [],
    }),
  );
  assert.equal(after, state);
});
test("example deductions save atomically rather than racing four independent saves", async () => {
  let state = data();
  let writes = 0;
  const rules = [1, 2, 3, 4].map((id) => deduction({ id: String(id) }));
  await commitWorkspaceAction(store.upsertDeductionsMany(rules), {
    read: () => state,
    write: async (proposed) => {
      writes++;
      assert.equal(proposed.deductions.length, 4);
    },
    dispatch: (action) => {
      state = reduce(state, action);
    },
  });
  assert.equal(writes, 1);
  assert.equal(state.deductions.length, 4);
  assert.equal(
    reduce(
      state,
      store.upsertDeductionsMany([deduction({ id: "bad", amount: -10 })]),
    ),
    state,
  );
});
test("failed receipt persistence keeps saved work and deduction ownership unchanged", async () => {
  let state = data({ history: [shift()] });
  const before = state;
  await assert.rejects(
    commitWorkspaceAction(
      store.recordPaycheck({
        paycheck: receipt(),
        markShifts: true,
        consumeDeductionIds: [],
      }),
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
  assert.equal(state.paychecks.length, 0);
});
test("all-time dates remain valid when the only stored entry is future-dated", () => {
  const result = pay.rangeBounds(
    "allTime",
    [shift("future", { date: "2026-11-01" })],
    "2026-10-26",
  );
  assert.deepEqual(result, { start: "2026-10-26", end: "2026-10-26" });
});
test("backup restore preserves overlapping periods in separate currency ledgers", () => {
  const state = data({
    paychecks: [receipt(), receipt({ id: "euro", currency: "EUR" })],
  });
  const imported = backup.parseBackup(
    backup.backupText(state),
    "pay-backup.json",
    state,
  );
  const restored = backup.applyImport(data(), imported, "replace", false);
  assert.equal(restored.paychecks.length, 2);
});
test("one-time percentages apply and consume only in the window containing their end date", () => {
  const item = deduction({
    frequency: "one-time",
    isPercentage: true,
    applicableFromDate: bounds.start,
    applicableToDate: bounds.end,
  });
  assert.equal(
    pay.deductionAmount(item, 100, new Map(), {
      start: bounds.start,
      end: "2026-10-14",
    }),
    0,
  );
  assert.equal(pay.deductionAmount(item, 100, new Map(), bounds), 10);
  const state = data({ deductions: [item] });
  assert.deepEqual(pay.consumptionIds(state, receipt()), []);
});
