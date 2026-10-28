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
const {
  visibleHistory,
  historySummary,
  canResume,
} = require("../src/features/history/summary.ts");
const { commitWorkspaceAction } = require("../src/services/commitWorkspace.ts");
const store = require("../src/store/appSlice.ts");
const { initialAppState: initial, appReducer: reduce } = store;
const now = new Date("2026-10-26T14:00:00").getTime();
const job = { ...initial.jobs[0], id: "usd", currency: "USD", hourlyRate: 20 };
const euro = { ...job, id: "eur", currency: "EUR", hourlyRate: 30 };
const data = (changes = {}) => ({
  ...initial,
  jobs: [job, euro],
  history: [],
  deductions: [],
  paychecks: [],
  ...changes,
});
const draft = (changes) => ({
  ...model.blankDraft("shift"),
  date: "2026-10-26",
  endDate: "2026-10-26",
  start: "09:00",
  end: "10:00",
  jobId: "usd",
  ...changes,
});
function entry(changes = {}, existing) {
  const result = model.prepareEntry(
    draft(changes),
    [job, euro],
    initial.defaultPlan,
    existing,
  );
  assert.equal(result.ok, true, result.error);
  return result.entry;
}

test("History applies date, job and entry type filters to live work as well as saved work", () => {
  const active = entry({ end: "" });
  const state = data({
    activeShift: active,
    extraShifts: [entry({ end: "", jobId: "eur" })],
  });
  assert.equal(
    visibleHistory(state, model.defaultFilters(), true, now).live.length,
    2,
  );
  for (const filters of [
    { period: "lastWeek" },
    { type: "projects" },
    { period: "custom", from: "2026-10-01", to: "2026-10-20" },
  ]) {
    assert.equal(
      visibleHistory(
        state,
        { ...model.defaultFilters(), ...filters },
        true,
        now,
      ).live.length,
      0,
    );
  }
  assert.deepEqual(
    visibleHistory(
      state,
      { ...model.defaultFilters(), jobId: "eur" },
      true,
      now,
    ).live.map((item) => item.jobId),
    ["eur"],
  );
});
test("live records are counted once even when an old history copy exists", () => {
  const active = entry({ end: "" });
  const state = data({ activeShift: active, history: [active] });
  const shown = visibleHistory(state, model.defaultFilters(), true, now);
  assert.equal(shown.entries.length, 0);
  assert.equal(
    historySummary(shown.entries, state, shown.live, now)[0].minutes,
    300,
  );
});
test("Free current-month entitlement applies to list totals and live records", () => {
  const state = data({
    history: [entry(), entry({ date: "2026-09-26" })],
    activeShift: entry({ date: "2026-09-26", end: "" }),
  });
  const shown = visibleHistory(state, model.defaultFilters(), false, now);
  assert.equal(shown.entries.length, 1);
  assert.equal(shown.live.length, 0);
});
test("unpaid filter excludes shifts covered by a matching currency paid receipt", () => {
  const shift = entry();
  const receipt = {
    id: "receipt",
    paid: true,
    jobId: "usd",
    startDate: shift.date,
    endDate: shift.date,
    currency: "USD",
  };
  const state = data({ history: [shift], paychecks: [receipt] });
  const filters = { ...model.defaultFilters(), unpaidOnly: true };
  assert.equal(visibleHistory(state, filters, true, now).entries.length, 0);
  assert.equal(
    model.paymentStatus(shift, [{ ...receipt, currency: "EUR" }], state.jobs),
    "Unpaid",
  );
});
test("summary keeps shift, project and tip earnings in separate currency ledgers", () => {
  const records = [
    entry({ tips: "5" }),
    entry({ jobId: "eur", tips: "10" }),
    entry({
      entryType: "project",
      projectName: "Logo",
      flatAmount: "100",
      currency: "EUR",
    }),
  ];
  const totals = historySummary(records, data());
  assert.deepEqual(
    totals.map((item) => [item.currency, item.gross, item.minutes]),
    [
      ["EUR", 140, 60],
      ["USD", 25, 60],
    ],
  );
});
test("deduction percentages respect job/date scope and consumed or disabled amounts are ignored", () => {
  const state = data({
    deductions: [
      {
        id: "tax",
        label: "Tax",
        amount: 10,
        frequency: "monthly",
        enabled: true,
        isPercentage: true,
        jobId: "usd",
      },
      {
        id: "future",
        label: "Future",
        amount: 100,
        frequency: "monthly",
        enabled: true,
        isPercentage: true,
        applicableFromDate: "2026-11-01",
      },
      {
        id: "used",
        label: "Used",
        amount: 100,
        frequency: "one-time",
        enabled: true,
        consumedByPaycheckId: "receipt",
      },
      {
        id: "off",
        label: "Off",
        amount: 100,
        frequency: "one-time",
        enabled: false,
      },
    ],
  });
  const totals = historySummary([entry(), entry({ jobId: "eur" })], state);
  assert.deepEqual(
    totals.map((item) => [item.currency, item.deductions]),
    [
      ["EUR", 0],
      ["USD", 2],
    ],
  );
});
test("global fixed deductions use global currency and estimated net cannot be negative", () => {
  const state = data({
    deductions: [
      {
        id: "fee",
        label: "Fee",
        amount: 100,
        frequency: "one-time",
        enabled: true,
      },
    ],
  });
  const totals = historySummary([entry(), entry({ jobId: "eur" })], state);
  assert.equal(totals.find((item) => item.currency === "USD").net, 0);
  assert.equal(totals.find((item) => item.currency === "EUR").deductions, 0);
});
test("multiple entries on one day do not duplicate fixed daily deductions", () => {
  const state = data({
    deductions: [
      {
        id: "fee",
        label: "Fee",
        amount: 10,
        frequency: "daily",
        enabled: true,
      },
    ],
  });
  assert.equal(
    historySummary([entry()], state)[0].deductions,
    historySummary([entry(), entry()], state)[0].deductions,
  );
});
test("incomplete shifts cannot be marked paid individually, in bulk or in the form", () => {
  const incomplete = entry({ end: "" });
  const complete = entry();
  const state = data({ history: [incomplete, complete] });
  assert.equal(model.paymentStatus(incomplete, [], state.jobs), "Incomplete");
  assert.equal(model.selectable(incomplete, [], state.jobs), false);
  assert.equal(
    reduce(state, store.toggleHistoryPaid(incomplete.id)).history[0].paid,
    false,
  );
  const after = reduce(
    state,
    store.markHistoryPaidMany([incomplete.id, complete.id]),
  );
  assert.equal(after.history[0].paid, false);
  assert.equal(after.history[1].paid, true);
  assert.equal(
    model.prepareEntry(
      draft({ end: "", paid: true }),
      state.jobs,
      state.defaultPlan,
    ).ok,
    false,
  );
});
test("notes on incomplete records can be edited without inventing a clock-out", () => {
  const original = entry({ end: "" });
  const result = model.prepareEntry(
    { ...model.draftForEntry(original), notes: "Need to confirm finish" },
    [job],
    initial.defaultPlan,
    original,
  );
  assert.equal(result.ok, true);
  assert.equal(result.entry.endedAt, null);
  assert.equal(result.entry.earnings, 0);
});
test("notes-only edits preserve clock seconds, rates and exact recorded breaks", () => {
  const original = {
    ...entry(),
    startedAt: new Date("2026-10-26T09:00:15").toISOString(),
    endedAt: new Date("2026-10-26T10:00:30").toISOString(),
    breakMinutes: 1,
    breaks: [
      {
        id: "b",
        start: new Date("2026-10-26T09:59:30").toISOString(),
        end: new Date("2026-10-26T10:00:30").toISOString(),
      },
    ],
  };
  const result = model.prepareEntry(
    { ...model.draftForEntry(original), notes: "checked" },
    [job],
    initial.defaultPlan,
    original,
  );
  assert.equal(result.ok, true, result.error);
  assert.equal(result.entry.startedAt, original.startedAt);
  assert.equal(result.entry.endedAt, original.endedAt);
  assert.equal(
    model.workedMinutes(result.entry),
    model.workedMinutes(original),
  );
});
test("recorded break overlap, outside shift and inconsistent totals are rejected", () => {
  const pause = {
    id: "b",
    start: new Date("2026-10-26T09:10:00").toISOString(),
    end: new Date("2026-10-26T09:20:00").toISOString(),
  };
  for (const changes of [
    { breaks: [pause], breakMinutes: "5" },
    { breaks: [pause, { ...pause, id: "b2" }], breakMinutes: "20" },
    {
      breaks: [pause],
      breakMinutes: "10",
      lunchStart: "09:15",
      lunchEnd: "09:25",
    },
    { breaks: [pause], breakMinutes: "10", start: "09:15" },
  ])
    assert.equal(
      model.prepareEntry(draft(changes), [job], initial.defaultPlan).ok,
      false,
    );
  assert.equal(
    model.prepareEntry(
      draft({ breaks: [pause], breakMinutes: "10" }),
      [job],
      initial.defaultPlan,
    ).ok,
    true,
  );
});
test("equal clock times are rejected rather than saving an accidental zero-hour shift", () => {
  assert.equal(
    model.prepareEntry(draft({ end: "09:00" }), [job], initial.defaultPlan).ok,
    false,
  );
});
test("overnight lunch after midnight stays on the correct day", () => {
  const shift = entry({
    start: "22:00",
    end: "06:00",
    lunchStart: "01:00",
    lunchEnd: "01:30",
  });
  assert.equal(model.workedMinutes(shift), 450);
});
test("overnight duration uses local calendar days across daylight saving transitions", () => {
  const shift = entry({ date: "2026-10-31", start: "22:00", end: "06:00" });
  const expected =
    (new Date("2026-11-01T06:00:00") - new Date("2026-10-31T22:00:00")) / 60000;
  assert.equal(model.workedMinutes(shift), expected);
});
test("changing a job updates overtime rules and currency without altering the source record", () => {
  const original = {
    ...entry(),
    overtimeThreshold: 8,
    overtimeMultiplier: 1.5,
  };
  const newJob = { ...euro, overtimeThreshold: 6, overtimeMultiplier: 2 };
  const result = model.prepareEntry(
    { ...model.draftForEntry(original), jobId: "eur" },
    [job, newJob],
    initial.defaultPlan,
    original,
  );
  assert.equal(result.ok, true);
  assert.equal(result.entry.currency, "EUR");
  assert.equal(result.entry.overtimeThreshold, 6);
  assert.equal(original.jobId, "usd");
});
test("nonexistent overnight clock-out during a daylight-saving jump is not silently moved", () => {
  const localEnd = new Date("2026-03-08T02:30:00");
  const exists = localEnd.getHours() === 2 && localEnd.getMinutes() === 30;
  const result = model.prepareEntry(
    draft({ date: "2026-03-07", start: "22:00", end: "02:30" }),
    [job],
    initial.defaultPlan,
  );
  assert.equal(result.ok, exists);
});
test("resume rejects past, future, archived, already-paid and competing sessions", () => {
  const shift = entry({ end: "" });
  assert.equal(canResume(shift, data(), now), true);
  for (const bad of [
    { ...shift, date: "2026-10-25" },
    { ...shift, startedAt: new Date(now + 60000).toISOString() },
    { ...shift, paid: true },
  ])
    assert.equal(canResume(bad, data(), now), false);
  for (const changes of [
    { orphanedShift: shift },
    { activeShift: shift },
    { extraShifts: [shift] },
    { jobs: [{ ...job, archived: true }] },
    { extraShifts: [entry({ jobId: "eur", end: "" })] },
  ])
    assert.equal(canResume(shift, data(changes), now), false);
});
test("failed durable write leaves an entry unchanged and reports no successful dispatch", async () => {
  const original = entry();
  let state = data({ history: [original] });
  let calls = 0;
  await assert.rejects(
    commitWorkspaceAction(store.deleteHistoryShift(original.id), {
      read: () => state,
      write: async () => {
        throw new Error("disk full");
      },
      dispatch: (action) => {
        calls++;
        state = reduce(state, action);
      },
    }),
    /disk full/,
  );
  assert.equal(calls, 0);
  assert.equal(state.history[0].id, original.id);
});
test("CSV represents paid receipt coverage consistently with the list", () => {
  const shift = entry();
  const receipt = {
    id: "r",
    paid: true,
    jobId: "usd",
    startDate: shift.date,
    endDate: shift.date,
    currency: "USD",
  };
  const csv = model.csvFor([shift], [job], initial.defaultPlan, "USD", [
    receipt,
  ]);
  assert.match(csv, /"yes"/);
});
