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
const {
  calculateHours,
  planChanges,
} = require("../src/features/tracker/model.ts");
const {
  calculatorDefaults,
  calculatorPay,
  selectCalculatorHours,
  selectCalculatorTime,
  calculatorHourOptions,
} = require("../src/features/tracker/calculatorLogic.ts");
const { initialAppState: initial } = require("../src/store/appSlice.ts");
const draft = (changes = {}) => ({
  mode: "times",
  start: "09:00",
  end: "17:30",
  hours: "8",
  lunchEnabled: true,
  lunchMinutes: "30",
  ...changes,
});
const at = (time) => `2026-10-20T${time}:00`;
const shift = (changes = {}) => ({
  id: "live",
  date: "2026-10-20",
  startedAt: at("09:00"),
  endedAt: null,
  lunchMinutes: 0,
  breakMinutes: 0,
  earnings: 0,
  jobId: "default",
  ...changes,
});
const job = (changes = {}) => ({
  id: "job",
  name: "Job",
  hourlyRate: 30,
  overtimeThreshold: 6,
  overtimeMultiplier: 2,
  currency: "USD",
  color: "#ffffff",
  ...changes,
});
const deduction = (changes = {}) => ({
  id: "d",
  label: "Daily cost",
  amount: 10,
  frequency: "daily",
  enabled: true,
  ...changes,
});
const pay = (changes = {}) =>
  calculatorPay(
    changes.hours ?? 8,
    initial.defaultPlan,
    changes.jobs ?? [job()],
    changes.deductions ?? [],
    "USD",
    changes.jobId ?? null,
    "2026-10-20",
  );

test("manual start and end determine work hours and pay", () => {
  const first = calculateHours(draft());
  const later = calculateHours(draft({ start: "10:00" }));
  const longer = calculateHours(draft({ end: "18:30" }));
  assert.equal(first.workMinutes, 480);
  assert.equal(pay({ hours: first.hours }).gross, 192);
  assert.equal(later.workMinutes, 420);
  assert.equal(pay({ hours: later.hours }).gross, 168);
  assert.equal(longer.workMinutes, 540);
  assert.equal(pay({ hours: longer.hours }).gross, 228);
});
test("manual input immediately clears a selected preset", () => {
  const preset = selectCalculatorHours(
    calculatorDefaults(initial.defaultPlan),
    "8",
  );
  const manual = selectCalculatorTime(preset, "start", "09:00");
  assert.equal(manual.mode, "times");
  assert.equal(manual.hours, "");
  assert.equal(manual.end, "");
  assert.ok("error" in calculateHours(manual));
});
test("manual end can be entered first without retaining preset hours", () => {
  const manual = selectCalculatorTime(
    calculatorDefaults(initial.defaultPlan),
    "end",
    "17:30",
  );
  assert.equal(manual.start, "");
  assert.equal(manual.hours, "");
  assert.ok("error" in calculateHours(manual));
  assert.equal(
    calculateHours(selectCalculatorTime(manual, "start", "09:00")).hours,
    8,
  );
});
test("changing either manual time preserves the other and updates duration", () => {
  const changedStart = selectCalculatorTime(draft(), "start", "10:00");
  assert.equal(changedStart.end, "17:30");
  assert.equal(calculateHours(changedStart).hours, 7);
  const changedEnd = selectCalculatorTime(changedStart, "end", "18:30");
  assert.equal(changedEnd.start, "10:00");
  assert.equal(calculateHours(changedEnd).hours, 8);
});
test("manual duration equal to a preset leaves all hour options unselected", () => {
  const manual = selectCalculatorTime(
    selectCalculatorTime(
      calculatorDefaults(initial.defaultPlan),
      "start",
      "09:00",
    ),
    "end",
    "17:30",
  );
  assert.equal(calculateHours(manual).hours, 8);
  assert.equal(manual.mode, "times");
  assert.equal(manual.hours, "");
});
test("selecting any hour option clears both manual timings", () => {
  for (const hours of calculatorHourOptions(8)) {
    const preset = selectCalculatorHours(draft(), String(hours));
    assert.equal(preset.start, "");
    assert.equal(preset.end, "");
    assert.equal(preset.mode, "hours");
    assert.equal(calculateHours(preset).hours, hours);
  }
});
test("preset hours are paid work and do not deduct lunch twice", () => {
  const preset = selectCalculatorHours(draft({ lunchMinutes: "60" }), "8");
  const result = calculateHours(preset);
  assert.equal(result.workMinutes, 480);
  assert.equal(result.lunchMinutes, 0);
  assert.equal(pay({ hours: result.hours }).gross, 192);
});
test("invalid hidden lunch values do not block selecting paid hours", () => {
  assert.equal(
    calculateHours(selectCalculatorHours(draft({ lunchMinutes: "abc" }), "8"))
      .hours,
    8,
  );
});
test("stale hours cannot supply pay while a manual time is missing", () => {
  assert.ok("error" in calculateHours(draft({ start: "", hours: "8" })));
  assert.ok("error" in calculateHours(draft({ end: "", hours: "8" })));
});
test("stale timings cannot affect preset calculation", () => {
  const result = calculateHours(
    draft({ mode: "hours", start: "23:00", end: "23:30", hours: "6" }),
  );
  assert.equal(result.hours, 6);
  assert.equal(result.dayOffset, 0);
});
test("repeated switching never resurrects previous timings or preset selection", () => {
  let current = draft();
  for (let i = 0; i < 3; i++) {
    current = selectCalculatorHours(current, "6");
    assert.equal(current.start, "");
    assert.equal(current.end, "");
    current = selectCalculatorTime(current, "start", "09:00");
    assert.equal(current.hours, "");
    assert.ok("error" in calculateHours(current));
    current = selectCalculatorTime(current, "end", "17:30");
    assert.equal(calculateHours(current).hours, 8);
  }
});
test("manual lunch settings survive switching and are applied only to timings", () => {
  let current = selectCalculatorHours(draft({ lunchMinutes: "45" }), "8");
  assert.equal(current.lunchMinutes, "45");
  assert.equal(calculateHours(current).hours, 8);
  current = selectCalculatorTime(
    selectCalculatorTime(current, "start", "09:00"),
    "end",
    "17:30",
  );
  assert.equal(calculateHours(current).hours, 7.75);
});
test("manual overnight interval calculates pay on the correct duration", () => {
  const result = calculateHours(draft({ start: "22:00", end: "06:30" }));
  assert.equal(result.hours, 8);
  assert.equal(result.dayOffset, 1);
  assert.equal(pay({ hours: result.hours }).gross, 192);
});
test("identical manual times are rejected rather than silently treated as 24 hours", () => {
  for (const value of ["00:00", "09:00", "23:59"])
    assert.ok("error" in calculateHours(draft({ start: value, end: value })));
  assert.equal(calculateHours(selectCalculatorHours(draft(), "24")).hours, 24);
});
test("invalid manual times and lunch values are rejected", () => {
  for (const changes of [
    { start: "25:00" },
    { end: "abc" },
    { lunchMinutes: "-1" },
    { lunchMinutes: "30.5" },
    { lunchMinutes: "" },
    { lunchMinutes: "181" },
    { end: "09:30" },
  ])
    assert.ok(
      "error" in calculateHours(draft(changes)),
      JSON.stringify(changes),
    );
});
test("turning off unpaid lunch uses the full manual interval", () => {
  assert.equal(calculateHours(draft({ lunchEnabled: false })).hours, 8.5);
});
test("preset hours validate bounds, decimals and minute precision", () => {
  for (const hours of ["", "0", "-1", "25", "Infinity", "0x10", "1e1", ".001"])
    assert.ok("error" in calculateHours(selectCalculatorHours(draft(), hours)));
  assert.equal(
    calculateHours(selectCalculatorHours(draft(), "7.9999")).workMinutes,
    480,
  );
  assert.equal(
    calculateHours(selectCalculatorHours(draft(), ".5")).workMinutes,
    30,
  );
});
test("saved custom hours are represented by an available hour option", () => {
  assert.ok(calculatorHourOptions(7.5).includes(7.5));
  assert.equal(
    calculatorHourOptions(8).filter((value) => value === 8).length,
    1,
  );
  assert.equal(calculatorHourOptions(0).includes(0), false);
});
test("reset uses saved paid hours with both manual timings clear", () => {
  const defaults = {
    ...initial.defaultPlan,
    plannedHours: 7.5,
    lunchMinutes: 45,
  };
  const reset = calculatorDefaults(defaults);
  assert.equal(reset.mode, "hours");
  assert.equal(reset.hours, "7.5");
  assert.equal(reset.start, "");
  assert.equal(reset.end, "");
  assert.equal(reset.lunchMinutes, "45");
});
test("both methods produce gross and net without a live shift", () => {
  for (const input of [
    draft(),
    selectCalculatorHours(calculatorDefaults(initial.defaultPlan), "8"),
  ]) {
    const result = calculateHours(input),
      estimate = pay({ hours: result.hours, deductions: [deduction()] });
    assert.equal(estimate.gross, 192);
    assert.equal(estimate.net, 182);
  }
});
test("calculations, selection and resetting do not modify shared work or defaults", () => {
  const state = {
    ...initial,
    activeShift: shift(),
    history: [shift({ endedAt: at("17:00") })],
  };
  const before = JSON.parse(JSON.stringify(state));
  let input = calculatorDefaults(state.defaultPlan);
  input = selectCalculatorTime(
    selectCalculatorTime(input, "start", "08:00"),
    "end",
    "17:30",
  );
  const result = calculateHours(input);
  assert.equal("changes" in result, false);
  calculatorPay(
    result.hours,
    state.defaultPlan,
    state.jobs,
    state.deductions,
    state.preferences.currency,
    null,
  );
  calculateHours(selectCalculatorHours(input, "6"));
  calculatorDefaults(state.defaultPlan);
  assert.deepEqual(state, before);
});
test("Today Plan still handles actual unpaid lunch independently of calculator inputs", () => {
  const changes = {
    planningMode: "end-time",
    plannedClockOut: "17:00",
    lunchEnabled: false,
  };
  assert.equal(
    planChanges(initial.todayPlan, changes, shift({ lunchMinutes: 30 }))
      .plannedHours,
    7.5,
  );
  assert.equal(
    planChanges(
      initial.todayPlan,
      changes,
      shift({ lunchPaid: true, lunchMinutes: 30 }),
    ).plannedHours,
    8,
  );
});
test("pay profile selects the same job rate, overtime and currency for the estimate", () => {
  const result = pay({ jobId: "job", jobs: [job({ currency: "EUR" })] });
  assert.equal(result.currency, "EUR");
  assert.equal(result.gross, 300);
  assert.equal(result.hourlyRate, 30);
  assert.equal(result.overtimeThreshold, 6);
  assert.equal(result.overtimeMultiplier, 2);
});
test("global pay profile excludes other jobs daily deductions", () => {
  const result = pay({
    deductions: [
      deduction(),
      deduction({ id: "scoped", amount: 100, jobId: "job" }),
    ],
  });
  assert.equal(result.deductions, 10);
  assert.equal(result.net, 182);
});
test("job preview includes global and selected-job deductions, never unrelated jobs", () => {
  const result = pay({
    jobId: "job",
    deductions: [
      deduction(),
      deduction({ id: "own", jobId: "job", amount: 20 }),
      deduction({ id: "other", jobId: "other", amount: 100 }),
    ],
  });
  assert.equal(result.deductions, 30);
  assert.equal(result.net, 270);
});
test("mixed-currency global flat deductions cannot be subtracted from another currency", () => {
  const result = pay({
    jobId: "job",
    jobs: [job({ currency: "EUR" })],
    deductions: [
      deduction(),
      deduction({ id: "pct", amount: 10, isPercentage: true }),
      deduction({ id: "eu", jobId: "job", amount: 5 }),
    ],
  });
  assert.equal(result.gross, 300);
  assert.equal(result.deductions, 35);
  assert.equal(result.net, 265);
});
test("net preview excludes disabled, expired, future and non-daily deductions", () => {
  const result = pay({
    deductions: [
      deduction({ enabled: false }),
      deduction({ id: "expired", applicableToDate: "2026-10-19" }),
      deduction({ id: "future", applicableFromDate: "2026-10-21" }),
      deduction({ id: "weekly", frequency: "weekly" }),
      deduction({
        id: "valid",
        applicableFromDate: "2026-10-20",
        applicableToDate: "2026-10-20",
      }),
    ],
  });
  assert.equal(result.deductions, 10);
});
test("net preview clamps at zero and preserves zero-rate jobs", () => {
  assert.equal(pay({ deductions: [deduction({ amount: 999 })] }).net, 0);
  assert.equal(pay({ jobId: "job", jobs: [job({ hourlyRate: 0 })] }).gross, 0);
});
test("deleted and archived pay profiles fall back to global defaults", () => {
  const result = pay({ jobId: "job", jobs: [job({ archived: true })] });
  assert.equal(result.currency, "USD");
  assert.equal(result.hourlyRate, initial.defaultPlan.hourlyRate);
  assert.equal(result.gross, 192);
});
test("a job actually named global does not collide with the global profile", () => {
  const jobs = [job({ id: "global", hourlyRate: 10 })];
  assert.equal(pay({ jobs }).gross, 192);
  assert.equal(pay({ jobs, jobId: "global" }).gross, 100);
});
