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
const model = require("../src/features/tracker/model.ts");
const actions = require("../src/store/appSlice.ts");
const { appReducer: reduce, initialAppState: initial } = actions;
const { dailySummary } = require("../src/features/tracker/dailySummary.ts");
const {
  trackerSections,
  visibleTrackerSection,
} = require("../src/features/tracker/sections.ts");
test("Tracker section tabs stay separate and retain Completed Today on empty days", () => {
  assert.deepEqual(
    trackerSections(true, 0).map((tab) => tab.id),
    ["completed", "manual", "plan", "reminders", "calculator"],
  );
  assert.equal(trackerSections(true, 0)[0].label, "Completed Today (0)");
  assert.equal(trackerSections(true, 3)[0].label, "Completed Today (3)");
});
test("disabling manual editing removes its tab and falls back to Today's Plan", () => {
  assert.equal(
    trackerSections(false, 2).some((tab) => tab.id === "manual"),
    false,
  );
  assert.equal(visibleTrackerSection("manual", false), "plan");
  assert.equal(visibleTrackerSection("manual", true), "manual");
});
test("Tracker ticks and changing completed counts do not change the selected section", () => {
  for (const id of ["completed", "plan", "reminders", "calculator"]) {
    assert.equal(visibleTrackerSection(id, true), id);
    assert.equal(visibleTrackerSection(id, false), id);
    assert.ok(trackerSections(false, 0).some((tab) => tab.id === id));
    assert.ok(trackerSections(false, 4).some((tab) => tab.id === id));
  }
});
const at = (time, date = "2026-10-20") =>
  new Date(`${date}T${time}:00`).toISOString();
const shift = (changes = {}) => ({
  id: "shift",
  date: "2026-10-20",
  startedAt: at("09:00"),
  endedAt: null,
  lunchMinutes: 0,
  breakMinutes: 0,
  earnings: 0,
  jobId: "default",
  currency: "USD",
  ...changes,
});
const times = (changes = {}) => ({
  start: "09:00",
  lunchStart: "",
  lunchEnd: "",
  end: "",
  ...changes,
});
const now = Date.parse(at("12:00", "2026-10-23"));

test("global saving keeps job overrides separate and Reset restores effective job defaults", () => {
  const job = {
    ...initial.jobs[0],
    hourlyRate: 30,
    lunchMinutes: 45,
    overtimeThreshold: 6,
  };
  const before = {
    ...initial,
    jobs: [job],
    todayPlan: {
      ...initial.todayPlan,
      plannedHours: 7,
      hourlyRate: 20,
      lunchMinutes: 15,
      overtimeThreshold: 8,
    },
  };
  const saved = reduce(before, actions.savePlanAsDefault());
  assert.equal(saved.defaultPlan.hourlyRate, 20);
  assert.equal(saved.defaultPlan.plannedHours, 7);
  assert.deepEqual(saved.jobs[0], job);
  const reset = reduce(saved, actions.resetTodayPlan());
  assert.equal(reset.todayPlan.hourlyRate, 30);
  assert.equal(reset.todayPlan.plannedHours, 7);
  assert.equal(reset.todayPlan.lunchMinutes, 45);
  assert.equal(reset.todayPlan.overtimeThreshold, 6);
});
test("saving global defaults cannot silently copy a foreign-currency rate", () => {
  const before = {
    ...initial,
    jobs: [{ ...initial.jobs[0], currency: "EUR" }],
    todayPlan: { ...initial.todayPlan, hourlyRate: 99 },
  };
  assert.deepEqual(reduce(before, actions.savePlanAsDefault()), before);
  const active = {
    ...before,
    jobs: initial.jobs,
    activeShift: shift({ currency: "EUR" }),
  };
  assert.deepEqual(reduce(active, actions.savePlanAsDefault()), active);
});
test("Reset keeps active timestamps, pauses, completed records and saved defaults intact", () => {
  const active = shift({ lunchStartedAt: at("11:30"), tips: 10 });
  const before = {
    ...initial,
    activeShift: active,
    history: [shift({ id: "saved", endedAt: at("17:00") })],
    todayPlan: { ...initial.todayPlan, hourlyRate: 99, plannedHours: 6 },
  };
  const after = reduce(before, actions.resetTodayPlan());
  assert.equal(after.activeShift.id, active.id);
  assert.equal(after.activeShift.startedAt, active.startedAt);
  assert.equal(after.activeShift.lunchStartedAt, active.lunchStartedAt);
  assert.equal(after.activeShift.tips, 10);
  assert.deepEqual(after.history, before.history);
  assert.deepEqual(after.defaultPlan, before.defaultPlan);
});
test("manual action describes starting, adjusting or completing the actual resulting shift", () => {
  const active = shift();
  const started = model.manualShift(
    active,
    times(),
    Date.parse(at("12:00")),
  ).shift;
  assert.equal(started.endedAt, null);
  assert.match(
    model.manualEntryAction(null, times(), false).title,
    /Start shift/,
  );
  const adjusted = model.manualShift(
    active,
    times({ start: "08:30" }),
    Date.parse(at("12:00")),
  ).shift;
  assert.equal(adjusted.endedAt, null);
  assert.equal(
    model.manualEntryAction(active, times(), false).title,
    "Save adjustments",
  );
  const completed = model.manualShift(active, times({ end: "17:00" })).shift;
  assert.ok(completed.endedAt);
  assert.equal(
    model.manualEntryAction(active, times({ end: "17:00" }), false).title,
    "Save completed shift",
  );
  assert.equal(
    model.manualEntryAction(completed, times({ end: "18:00" }), true).title,
    "Save correction",
  );
});
test("completed gross includes tips consistently with Today Summary for each tip type", () => {
  for (const tipType of ["cash", "paycheck", "card", "other"]) {
    const entry = shift({
      endedAt: at("17:00"),
      lunchMinutes: 30,
      tips: 20,
      tipType,
    });
    const card = model.completedShiftTotals(
      entry,
      initial.jobs,
      initial.defaultPlan,
      "USD",
    );
    const summary = dailySummary(
      { ...initial, history: [entry] },
      Date.parse(at("18:00")),
    );
    assert.equal(card.wages, 180);
    assert.equal(card.tips, 20);
    assert.equal(card.total, 200);
    assert.equal(card.total, summary.groups[0].gross);
    assert.equal(card.workedSeconds, 450 * 60);
  }
});
test("completed amount honors saved pay rules and resolves currency without inventing USD", () => {
  const entry = shift({
    endedAt: at("18:00"),
    customRate: 30,
    overtimeThreshold: 6,
    overtimeMultiplier: 2,
    tips: 10,
    currency: null,
  });
  const result = model.completedShiftTotals(
    entry,
    initial.jobs,
    initial.defaultPlan,
    "EUR",
  );
  assert.equal(result.total, 370);
  assert.equal(result.currency, "EUR");
  assert.equal(
    model.completedShiftTotals(
      entry,
      [{ ...initial.jobs[0], currency: "GBP" }],
      initial.defaultPlan,
      "EUR",
    ).currency,
    "GBP",
  );
});
test("recovery accepts explicit multi-day end dates without assuming start day or tomorrow", () => {
  const endedAt = model.recoveryEndAt("2026-10-22", "17:00");
  const result = model.prepareRecovery(shift(), endedAt, initial, now);
  assert.equal(result.entry.endedAt, at("17:00", "2026-10-22"));
  assert.equal(result.elapsedSeconds, 56 * 3600);
  assert.equal(result.workedSeconds, 56 * 3600);
});
test("recovery rejects end dates/times before start or in the future", () => {
  for (const end of [
    at("08:00"),
    at("09:00"),
    at("13:00", "2026-10-23"),
    "bad",
  ])
    assert.ok("error" in model.prepareRecovery(shift(), end, initial, now));
});
test("recovery rejects invalid calendar dates, time values and DST gaps", () => {
  assert.equal(model.recoveryEndAt("2026-02-30", "09:00"), null);
  assert.equal(model.recoveryEndAt("2026-10-20", "25:00"), null);
  const raw = new Date("2026-03-08T02:30:00");
  const expected = raw.getHours() === 2 ? raw.toISOString() : null;
  assert.equal(model.recoveryEndAt("2026-03-08", "02:30"), expected);
});
test("recovery preview includes the entire open lunch and preserves own job currency/rate", () => {
  const job = { ...initial.jobs[0], hourlyRate: 10, currency: "EUR" };
  const source = shift({ lunchStartedAt: at("11:30"), currency: "EUR" });
  const data = {
    ...initial,
    jobs: [job],
    todayPlan: { ...initial.todayPlan, hourlyRate: 99 },
  };
  const result = model.prepareRecovery(source, at("12:00"), data, now);
  assert.equal(result.entry.lunchMinutes, 30);
  assert.equal(result.workedSeconds, 150 * 60);
  assert.equal(result.entry.earnings, 25);
  assert.equal(result.entry.currency, "EUR");
  assert.equal(source.lunchStartedAt, at("11:30"));
});
test("recovery closes legacy open break records and recorded lunch without losing time", () => {
  const source = shift({
    historyLunchStart: at("11:00"),
    historyLunchEnd: null,
    breakMinutes: 15,
    breaks: [
      { id: "b", label: "Coffee", start: at("10:00"), end: at("10:15") },
    ],
  });
  const result = model.prepareRecovery(source, at("12:00"), initial, now);
  assert.equal(result.entry.lunchMinutes, 60);
  assert.equal(result.entry.breakMinutes, 15);
  assert.equal(result.entry.breaks[0].label, "Coffee");
  const openBreak = model.prepareRecovery(
    shift({
      breaks: [{ id: "open", label: "Walk", start: at("11:00"), end: null }],
    }),
    at("12:00"),
    initial,
    now,
  );
  assert.equal(openBreak.entry.breakMinutes, 60);
  assert.equal(openBreak.entry.breaks[0].end, at("12:00"));
});
test("recovery rejects pauses outside the proposed shift and impossible durations", () => {
  for (const changes of [
    { lunchStartedAt: at("13:00") },
    { historyLunchStart: at("08:00"), historyLunchEnd: at("09:00") },
    { breakMinutes: 999 },
    { lunchMinutes: NaN },
    { missingClockIn: true },
  ])
    assert.ok(
      "error" in
        model.prepareRecovery(shift(changes), at("12:00"), initial, now),
    );
});
test("recovery preview does not mutate live or historical work and commits once", () => {
  const source = shift(),
    before = { ...initial, orphanedShift: source };
  const snapshot = JSON.parse(JSON.stringify(before));
  const result = model.prepareRecovery(source, at("17:00"), before, now);
  assert.deepEqual(before, snapshot);
  const saved = reduce(before, actions.resolveOrphanedShift(result.entry));
  assert.equal(saved.orphanedShift, null);
  assert.equal(saved.history.length, 1);
  assert.deepEqual(
    reduce(saved, actions.resolveOrphanedShift(result.entry)),
    saved,
  );
});
test("short completed lunch makes the duration-plan estimate agree with remaining work", () => {
  const source = shift({
    lunchMinutes: 10,
    historyLunchStart: at("11:00"),
    historyLunchEnd: at("11:10"),
  });
  const result = model.trackerMetrics(
    source,
    initial.todayPlan,
    Date.parse(at("12:00")),
  );
  assert.equal(result.pendingLunch, 0);
  assert.equal(result.projected, Date.parse(at("17:10")));
  assert.equal(
    Date.parse(at("12:00")) + result.remainingTotal * 1000,
    result.projected,
  );
});
test("a fixed end-time target remains fixed after a shorter completed lunch", () => {
  const source = shift({ lunchMinutes: 10, historyLunchEnd: at("11:10") });
  const plan = model.planChanges(
    initial.todayPlan,
    { planningMode: "end-time", plannedClockOut: "17:30" },
    source,
  );
  const metrics = model.trackerMetrics(source, plan, Date.parse(at("12:00")));
  assert.equal(metrics.projected, Date.parse(at("17:30")));
});
