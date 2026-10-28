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
const { dailySummary } = require("../src/features/tracker/dailySummary.ts");
const actions = require("../src/store/appSlice.ts");
const { appReducer: reduce, initialAppState: initial } = actions;
const model = require("../src/features/tracker/model.ts");
const at = (time, date = "2026-10-20") =>
  new Date(`${date}T${time}:00`).toISOString();
const now = Date.parse(at("12:00"));
const entry = (changes = {}) => ({
  id: "entry",
  date: "2026-10-20",
  startedAt: at("06:00"),
  endedAt: at("08:00"),
  lunchMinutes: 0,
  breakMinutes: 0,
  earnings: 9999,
  jobId: "default",
  currency: "USD",
  ...changes,
});
const data = (changes) => ({ ...initial, ...changes });
const summary = (state, time = now) => dailySummary(state, time);
const usd = (state) =>
  summary(state).groups.find((group) => group.currency === "USD");

test("empty day has a distinct empty state, not fabricated zero-earnings entries", () => {
  assert.deepEqual(summary(initial).groups, []);
});
test("manual completed time immediately contributes even with no active shift", () => {
  const manual = model.manualShift(entry({ endedAt: null }), {
    start: "06:00",
    lunchStart: "",
    lunchEnd: "",
    end: "08:00",
  }).shift;
  const state = reduce(initial, actions.addManualShift(manual));
  assert.equal(usd(state).gross, 48);
  assert.equal(usd(state).workedSeconds, 7200);
  assert.equal(usd(state).completedCount, 1);
  assert.equal(usd(state).runningCount, 0);
});
test("clock-in live amount is retained unchanged after clock-out", () => {
  let state = reduce(
    initial,
    actions.clockIn(entry({ startedAt: at("09:00"), endedAt: null })),
  );
  const live = usd(state);
  state = reduce(
    state,
    actions.clockOut(
      model.finishShift(state.activeShift, at("12:00"), state, true),
    ),
  );
  assert.equal(usd(state).gross, live.gross);
  assert.equal(usd(state).workedSeconds, live.workedSeconds);
  assert.equal(usd(state).gross, 72);
  assert.equal(usd(state).runningCount, 0);
  assert.equal(summary(state, Date.parse(at("13:00"))).groups[0].gross, 72);
});
test("starting another shift retains previous work and adds only new live time", () => {
  let state = data({ history: [entry()] });
  state = reduce(
    state,
    actions.clockIn(
      entry({ id: "second", startedAt: at("09:00"), endedAt: null }),
    ),
  );
  assert.equal(usd(state).gross, 120);
  assert.equal(usd(state).workedSeconds, 5 * 3600);
  assert.equal(usd(state).completedCount, 1);
  assert.equal(usd(state).runningCount, 1);
  assert.equal(summary(state, Date.parse(at("13:00"))).groups[0].gross, 144);
});
test("corrections recalculate earnings from times, ignoring stale cached earnings", () => {
  const before = data({ history: [entry()] });
  const corrected = reduce(
    before,
    actions.updateHistoryShift({
      id: "entry",
      changes: { endedAt: at("09:00") },
    }),
  );
  assert.equal(usd(before).gross, 48);
  assert.equal(usd(corrected).gross, 72);
  const deleted = reduce(corrected, actions.deleteHistoryShift("entry"));
  assert.deepEqual(summary(deleted).groups, []);
});
test("multiple entries and concurrent jobs contribute exactly once each", () => {
  const state = data({
    history: [
      entry(),
      entry({ id: "live", startedAt: at("09:00"), endedAt: null }),
    ],
    activeShift: entry({ id: "live", startedAt: at("09:00"), endedAt: null }),
    extraShifts: [
      entry({
        id: "extra",
        startedAt: at("10:00"),
        endedAt: null,
        customRate: 10,
      }),
    ],
  });
  assert.equal(usd(state).gross, 140);
  assert.equal(usd(state).runningCount, 2);
  assert.equal(usd(state).completedCount, 1);
});
test("live record overrides an obsolete completed history copy with same ID", () => {
  const state = data({
    history: [entry()],
    activeShift: entry({ endedAt: null, startedAt: at("09:00") }),
  });
  assert.equal(usd(state).gross, 72);
  assert.equal(usd(state).runningCount, 1);
  assert.equal(usd(state).completedCount, 0);
});
test("different currencies stay separate and resolve missing currency from job then preferences", () => {
  const state = data({
    jobs: [
      ...initial.jobs,
      {
        id: "euro",
        name: "Euro job",
        hourlyRate: 10,
        currency: "EUR",
        color: "#ffffff",
      },
    ],
    history: [
      entry(),
      entry({ id: "eu", jobId: "euro", currency: undefined }),
      entry({ id: "fallback", jobId: null, currency: undefined }),
    ],
    preferences: { ...initial.preferences, currency: "GBP" },
  });
  const groups = summary(state).groups;
  assert.deepEqual(
    groups.map((group) => group.currency),
    ["EUR", "GBP", "USD"],
  );
  assert.equal(groups[0].gross, 20);
  assert.equal(groups[1].gross, 48);
  assert.equal(groups[2].gross, 48);
});
test("overtime and different job rates use each record rules, not current selected job", () => {
  const state = data({
    todayPlan: { ...initial.todayPlan, hourlyRate: 99 },
    history: [
      entry({
        endedAt: at("15:00"),
        customRate: 20,
        overtimeThreshold: 6,
        overtimeMultiplier: 2,
      }),
    ],
  });
  assert.equal(usd(state).gross, 240);
  assert.equal(usd(state).regularSeconds, 6 * 3600);
  assert.equal(usd(state).overtimeSeconds, 3 * 3600);
});
test("net estimates apply each job receipt rate and leave cash tips undeducted", () => {
  const state = data({
    jobs: [
      ...initial.jobs,
      { id: "other", name: "Other", hourlyRate: 24, color: "#ffffff" },
    ],
    history: [
      entry({ tips: 10, tipType: "cash" }),
      entry({
        id: "other-entry",
        jobId: "other",
        tips: 10,
        tipType: "paycheck",
      }),
    ],
    paychecks: [
      {
        id: "a",
        jobId: "default",
        currency: "USD",
        paid: true,
        grossPay: 100,
        netPay: 80,
        payDate: "2026-10-15",
      },
      {
        id: "b",
        jobId: "other",
        currency: "USD",
        paid: true,
        grossPay: 100,
        netPay: 90,
        payDate: "2026-10-15",
      },
    ],
  });
  assert.equal(usd(state).gross, 116);
  assert.equal(usd(state).tips, 20);
  assert.ok(Math.abs(usd(state).net - (48 * 0.8 + 10 + 58 * 0.9)) < 1e-8);
});
test("without receipts estimated net equals gross and does not invent a deduction percentage", () => {
  const state = data({
    history: [entry({ tips: 10, tipType: "cash" })],
    deductionRate: 0.5,
  });
  assert.equal(usd(state).net, usd(state).gross);
});
test("flat-rate projects dated today count as earnings without invented work hours", () => {
  const state = data({
    history: [
      entry({ entryType: "project", flatAmount: 150, id: "project", tips: 25 }),
    ],
  });
  assert.equal(usd(state).gross, 150);
  assert.equal(usd(state).workedSeconds, 0);
  assert.equal(usd(state).projectCount, 1);
  assert.equal(usd(state).tips, 0);
});
test("pauses freeze live work and pay while completed totals remain intact", () => {
  const state = data({
    history: [entry()],
    activeShift: entry({
      id: "live",
      startedAt: at("09:00"),
      endedAt: null,
      lunchStartedAt: at("11:30"),
    }),
  });
  assert.equal(usd(state).gross, 108);
  assert.equal(usd(state).lunchSeconds, 30 * 60);
  const later = summary(state, Date.parse(at("12:30"))).groups[0];
  assert.equal(later.gross, 108);
  assert.equal(later.lunchSeconds, 60 * 60);
});
test("paid lunch stays payable and general breaks still reduce daily work", () => {
  const state = data({
    history: [entry({ lunchMinutes: 30, lunchPaid: true, breakMinutes: 15 })],
  });
  assert.equal(usd(state).gross, 42);
  assert.equal(usd(state).workedSeconds, 105 * 60);
  assert.equal(usd(state).lunchSeconds, 30 * 60);
  assert.equal(usd(state).breakSeconds, 15 * 60);
});
test("prior/future dates and incomplete untracked drafts do not count as work today", () => {
  const state = data({
    history: [
      entry({ date: "2026-10-19" }),
      entry({ id: "future", date: "2026-10-21" }),
      entry({ id: "missing", missingClockIn: true }),
      entry({ id: "draft", endedAt: null }),
    ],
  });
  assert.deepEqual(summary(state).groups, []);
});
test("daily date is local and rolls at local midnight; overnight records retain their recorded start day", () => {
  const state = data({
    history: [
      entry({ startedAt: at("22:00"), endedAt: at("02:00", "2026-10-21") }),
    ],
  });
  assert.equal(
    summary(state, Date.parse(at("23:59"))).groups[0].workedSeconds,
    4 * 3600,
  );
  assert.equal(
    summary(state, Date.parse(at("00:00", "2026-10-21"))).day,
    "2026-10-21",
  );
  assert.deepEqual(
    summary(state, Date.parse(at("00:00", "2026-10-21"))).groups,
    [],
  );
});
test("a recorded zero-rate shift is still recorded work, not an empty day", () => {
  const state = data({ history: [entry({ customRate: 0 })] });
  assert.equal(usd(state).gross, 0);
  assert.equal(usd(state).completedCount, 1);
  assert.equal(usd(state).workedSeconds, 7200);
});
test("rehydration recomputes the daily total without requiring a running timer", () => {
  const saved = data({ history: [entry()] });
  const loaded = reduce(
    initial,
    actions.hydrate(JSON.parse(JSON.stringify(saved))),
  );
  assert.deepEqual(summary(loaded), summary(saved));
});
