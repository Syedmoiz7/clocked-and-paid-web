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
const {
  wagesFor,
  workedMinutes,
  draftForEntry,
} = require("../src/features/history/model.ts");
const {
  backupText,
  parseBackup,
} = require("../src/features/settings/backup.ts");
const { jobAlerts } = require("../src/features/jobs/model.ts");
const { commitTrackerAction } = require("../src/features/tracker/commit.ts");
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
const plan = (changes = {}) => ({ ...initial.todayPlan, ...changes });
const metrics = (entry, time = "12:00", changes = {}) =>
  model.trackerMetrics(entry, plan(changes), Date.parse(at(time)));
const times = (changes = {}) => ({
  start: "09:00",
  lunchStart: "",
  lunchEnd: "",
  end: "",
  ...changes,
});
const calc = (changes = {}) => ({
  mode: "times",
  start: "09:00",
  end: "17:30",
  hours: "8",
  lunchEnabled: true,
  lunchMinutes: "30",
  ...changes,
});

test("work timer, progress and earnings freeze during an open unpaid break", () => {
  const entry = shift({ breakStartedAt: at("11:00") });
  const result = metrics(entry);
  assert.equal(result.worked, 7200);
  assert.equal(result.gross, 48);
  assert.equal(result.progress, 25);
  assert.equal(result.liveBreak, 3600);
  assert.equal(metrics(entry, "12:30").worked, result.worked);
});
test("lunch totals include completed and open lunch without replacing previous minutes", () => {
  const result = metrics(
    shift({ lunchMinutes: 10, lunchStartedAt: at("11:30") }),
  );
  assert.equal(result.worked, 140 * 60);
  assert.equal(result.lunch, 40 * 60);
});
test("paid lunch remains payable while unpaid general breaks still reduce work", () => {
  const result = metrics(
    shift({ lunchPaid: true, lunchMinutes: 30, breakMinutes: 15 }),
  );
  assert.equal(result.worked, 165 * 60);
  assert.equal(result.gross, 66);
});
test("remaining includes future lunch rather than adding breaks already taken", () => {
  const result = metrics(shift({ breakMinutes: 15 }));
  assert.equal(result.remainingWork, 315 * 60);
  assert.equal(result.remainingTotal, 345 * 60);
  assert.equal(result.projected, Date.parse(at("17:45")));
});
test("pending lunch decreases during lunch and is zero after an early lunch finish", () => {
  assert.equal(
    metrics(shift({ lunchStartedAt: at("11:45") })).pendingLunch,
    15 * 60,
  );
  assert.equal(
    metrics(shift({ lunchMinutes: 10, historyLunchEnd: at("11:40") }))
      .pendingLunch,
    0,
  );
});
test("long lunch pushes projected end and no-lunch planning retains actual unpaid time", () => {
  assert.equal(
    metrics(shift({ lunchMinutes: 60 })).projected,
    Date.parse(at("18:00")),
  );
  assert.equal(
    metrics(shift({ lunchMinutes: 20 }), "12:00", { lunchEnabled: false })
      .projected,
    Date.parse(at("17:20")),
  );
});
test("clock-out during lunch includes the open lunch and clears active pause markers", () => {
  const done = model.finishShift(
    shift({ lunchStartedAt: at("11:30") }),
    at("12:00"),
    initial,
    true,
  );
  assert.equal(done.lunchMinutes, 30);
  assert.equal(done.historyLunchStart, at("11:30"));
  assert.equal(done.historyLunchEnd, at("12:00"));
  assert.equal(done.lunchStartedAt, null);
  assert.equal(done.earnings, 60);
  assert.equal(workedMinutes(done), 150);
});
test("clock-out during a labeled break closes its record and includes fractional minutes", () => {
  const start = new Date(Date.parse(at("11:30")) + 30000).toISOString();
  const done = model.finishShift(
    shift({
      breakStartedAt: start,
      breakLabel: "Coffee",
      breaks: [{ id: "b", start, end: null, label: "Coffee" }],
    }),
    at("12:00"),
    initial,
    true,
  );
  assert.equal(done.breakMinutes, 29.5);
  assert.equal(done.breaks[0].end, at("12:00"));
  assert.equal(done.breaks[0].label, "Coffee");
  assert.equal(done.earnings, 60.2);
});
test("closing completed pauses again cannot double-charge lunch or breaks", () => {
  const done = model.completedShift(
    shift({ lunchStartedAt: at("11:30") }),
    at("12:00"),
  );
  assert.deepEqual(model.completedShift(done, at("12:00")), done);
});
test("rate and overtime overrides survive clock-out and agree with History wages", () => {
  const data = {
    ...initial,
    todayPlan: plan({
      hourlyRate: 30,
      overtimeThreshold: 6,
      overtimeMultiplier: 2,
    }),
  };
  const done = model.finishShift(shift(), at("18:00"), data, true);
  assert.equal(done.earnings, 360);
  assert.equal(done.customRate, 30);
  assert.equal(
    wagesFor(
      done,
      [{ ...initial.jobs[0], hourlyRate: 99, overtimeThreshold: 12 }],
      initial.defaultPlan,
    ),
    360,
  );
});
test("orphan and additional shifts use their own job and saved rates, not selected plan", () => {
  const data = {
    ...initial,
    jobs: [
      {
        ...initial.jobs[0],
        hourlyRate: 15,
        overtimeThreshold: 6,
        overtimeMultiplier: 2,
      },
    ],
    todayPlan: plan({ hourlyRate: 99 }),
  };
  assert.equal(model.finishShift(shift(), at("17:00"), data).earnings, 150);
  assert.equal(
    model.finishShift(
      shift({ customRate: 20, overtimeThreshold: 8, overtimeMultiplier: 1.5 }),
      at("17:00"),
      data,
    ).earnings,
    160,
  );
});
test("end-time plan recomputes when lunch toggles or duration changes", () => {
  const current = plan({ planningMode: "end-time", plannedClockOut: "17:30" });
  assert.equal(
    model.planChanges(current, { lunchEnabled: false }, shift()).plannedHours,
    8.5,
  );
  assert.equal(
    model.planChanges(current, { lunchMinutes: 60 }, shift()).plannedHours,
    7.5,
  );
});
test("end-time plan aligns to actual clock-in and completed lunch overrun", () => {
  const current = plan({ planningMode: "end-time", plannedClockOut: "17:30" });
  assert.equal(
    model.planChanges(current, {}, shift({ startedAt: at("10:00") }))
      .plannedHours,
    7,
  );
  assert.equal(
    model.planChanges(current, {}, shift({ lunchMinutes: 60 })).plannedHours,
    7.5,
  );
});
test("overnight end-time planning and midnight targets remain valid", () => {
  const result = model.planChanges(
    plan(),
    { planningMode: "end-time", plannedClockOut: "06:30" },
    shift({ startedAt: at("22:00") }),
  );
  assert.equal(result.plannedHours, 8);
  assert.equal(
    model.planChanges(
      plan(),
      {
        planningMode: "end-time",
        plannedClockOut: "00:00",
        lunchEnabled: false,
      },
      shift({ startedAt: at("22:00") }),
    ).plannedHours,
    2,
  );
});
test("invalid/non-finite plan inputs never enter shared state", () => {
  for (const changes of [
    { hourlyRate: Infinity },
    { plannedHours: NaN },
    { lunchMinutes: -1 },
    { overtimeThreshold: 25 },
    { overtimeMultiplier: 5 },
    { plannedClockOut: "25:00", planningMode: "end-time" },
  ])
    assert.equal(model.planChanges(plan(), changes, shift()), null);
});
test("calculator supports independent manual-time and preset-hour methods", () => {
  const manual = model.calculateHours(calc({ start: "09:00", end: "17:30" }));
  const preset = model.calculateHours(
    calc({ mode: "hours", hours: "8", start: "", end: "" }),
  );
  assert.equal(manual.workMinutes, 480);
  assert.equal(preset.workMinutes, 480);
});
test("calculator manual overnight duration is correct", () => {
  const result = model.calculateHours(calc({ start: "22:00", end: "06:30" }));
  assert.equal(result.hours, 8);
  assert.equal(result.dayOffset, 1);
});
test("calculator validates malformed manual times and invalid preset hours", () => {
  for (const changes of [
    { mode: "hours", hours: "" },
    { mode: "hours", hours: "-1" },
    { mode: "hours", hours: "25" },
    { lunchMinutes: "-2" },
    { lunchMinutes: "" },
    { start: "24:00" },
    { start: "09:00", end: "09:15", lunchMinutes: "30" },
  ])
    assert.ok("error" in model.calculateHours(calc(changes)));
});
test("calculator methods leave shared plan and active records unchanged", () => {
  const data = {
    ...initial,
    activeShift: shift(),
    history: [shift({ id: "saved", endedAt: at("10:00") })],
  };
  const before = JSON.parse(JSON.stringify(data));
  for (const mode of ["times", "hours"]) {
    const result = model.calculateHours(
      calc({ mode, start: "06:00", end: "17:30", hours: "6" }),
    );
    assert.equal("error" in result, false);
    assert.equal("changes" in result, false);
  }
  assert.deepEqual(data, before);
});
test("manual clock-in without clock-out creates a running shift", () => {
  const result = model.manualShift(shift(), times(), Date.parse(at("12:00")));
  assert.ok(result.shift);
  assert.equal(result.shift.endedAt, null);
  const data = reduce(initial, actions.clockIn(result.shift));
  assert.equal(data.activeShift.id, "shift");
  assert.equal(data.history.length, 0);
});
test("manual active adjustments preserve a running timer, lunch, labels and tips", () => {
  const source = shift({
    lunchMinutes: 20,
    breakMinutes: 10,
    tips: 15,
    tipType: "cash",
    customRate: 30,
    breaks: [
      { id: "b", start: at("10:00"), end: at("10:10"), label: "Coffee" },
    ],
  });
  const result = model.manualShift(
    source,
    times({ start: "08:30" }),
    Date.parse(at("12:00")),
  ).shift;
  assert.equal(result.lunchMinutes, 20);
  assert.deepEqual(result.breaks, source.breaks);
  assert.equal(result.tips, 15);
  assert.equal(result.customRate, 30);
  assert.equal(result.endedAt, null);
});
test("manual correction keeps original day and existing lunch timestamps", () => {
  const source = shift({
    endedAt: at("17:00"),
    lunchMinutes: 30,
    historyLunchStart: at("12:00"),
    historyLunchEnd: at("12:30"),
  });
  const draft = draftForEntry(source);
  const result = model.manualShift(
    source,
    times({
      start: draft.start,
      end: "18:00",
      lunchStart: draft.lunchStart,
      lunchEnd: draft.lunchEnd,
    }),
  ).shift;
  assert.equal(result.date, source.date);
  assert.equal(result.startedAt, source.startedAt);
  assert.equal(result.historyLunchStart, source.historyLunchStart);
  assert.equal(result.lunchMinutes, 30);
});
test("manual overnight lunch after midnight is contained in the correct day", () => {
  const source = shift({ startedAt: at("22:00") });
  const result = model.manualShift(
    source,
    times({
      start: "22:00",
      end: "06:00",
      lunchStart: "02:00",
      lunchEnd: "02:30",
    }),
  ).shift;
  assert.equal(result.endedAt, at("06:00", "2026-10-21"));
  assert.equal(result.historyLunchStart, at("02:00", "2026-10-21"));
  assert.equal(workedMinutes(result), 450);
});
test("manual open lunch can remain active or close at manual clock-out", () => {
  const open = model.manualShift(
    shift(),
    times({ lunchStart: "11:30" }),
    Date.parse(at("12:00")),
  ).shift;
  assert.equal(open.lunchStartedAt, at("11:30"));
  assert.equal(open.lunchMinutes, 0);
  const done = model.manualShift(
    open,
    times({ lunchStart: "11:30", end: "12:00" }),
  ).shift;
  assert.equal(done.lunchMinutes, 30);
  assert.equal(done.lunchStartedAt, null);
});
test("clearing lunch is explicit and does not discard general breaks", () => {
  const source = shift({ lunchMinutes: 30, breakMinutes: 10 });
  const result = model.manualShift(
    source,
    times({ clearLunch: true }),
    Date.parse(at("12:00")),
  ).shift;
  assert.equal(result.lunchMinutes, 0);
  assert.equal(result.breakMinutes, 10);
});
test("invalid manual times, future active starts, orphan lunch end and erased completed end are rejected", () => {
  for (const change of [
    { start: "25:00" },
    { start: "9:00" },
    { start: "13:00" },
    { lunchEnd: "11:30" },
    { end: "09:00" },
    { lunchStart: "14:00" },
  ])
    assert.ok(
      "error" in
        model.manualShift(shift(), times(change), Date.parse(at("12:00"))),
      JSON.stringify(change),
    );
  assert.ok(
    "error" in model.manualShift(shift({ endedAt: at("17:00") }), times()),
  );
});
test("manual shift correction cannot silently move recorded breaks outside the new range", () => {
  const source = shift({
    breakMinutes: 15,
    breaks: [{ id: "b", start: at("10:00"), end: at("10:15") }],
  });
  assert.ok(
    "error" in
      model.manualShift(source, times({ start: "11:00", end: "17:00" })),
  );
});
test("pause reducers refuse overlapping or repeated lunch/break starts", () => {
  let data = reduce(initial, actions.clockIn(shift()));
  data = reduce(data, actions.startLunch(at("11:30")));
  assert.deepEqual(
    reduce(data, actions.startBreak({ at: at("11:40"), label: "Coffee" })),
    data,
  );
  assert.deepEqual(reduce(data, actions.startLunch(at("11:40"))), data);
  data = reduce(data, actions.endLunch(at("12:00")));
  assert.deepEqual(reduce(data, actions.startLunch(at("12:30"))), data);
});
test("multiple general breaks retain each label and exact elapsed totals", () => {
  let data = reduce(initial, actions.clockIn(shift()));
  data = reduce(data, actions.startBreak({ at: at("10:00"), label: "Coffee" }));
  data = reduce(data, actions.endBreak(at("10:10")));
  data = reduce(data, actions.startBreak({ at: at("11:00"), label: "Walk" }));
  data = reduce(data, actions.endBreak(at("11:15")));
  assert.equal(data.activeShift.breakMinutes, 25);
  assert.deepEqual(
    data.activeShift.breaks.map((item) => item.label),
    ["Coffee", "Walk"],
  );
});
test("clock-in cannot overwrite a running or recoverable shift or duplicate an additional job", () => {
  for (const before of [
    { ...initial, activeShift: shift() },
    { ...initial, orphanedShift: shift() },
    { ...initial, extraShifts: [shift()] },
  ])
    assert.deepEqual(
      reduce(before, actions.clockIn(shift({ id: "new" }))),
      before,
    );
});
test("repeated clock-out action cannot duplicate history or clear a different active shift", () => {
  const data = reduce(initial, actions.clockIn(shift()));
  const action = actions.clockOut(
    model.finishShift(data.activeShift, at("17:00"), data, true),
  );
  const done = reduce(data, action);
  assert.equal(done.history.length, 1);
  assert.equal(done.activeShift, null);
  assert.deepEqual(reduce(done, action), done);
  assert.deepEqual(
    reduce({ ...done, activeShift: shift({ id: "other" }) }, action).activeShift
      .id,
    "other",
  );
});
test("ending Premium keeps running additional shifts and permits safe completion", () => {
  let data = {
    ...initial,
    activeShift: shift(),
    extraShifts: [shift({ id: "extra", jobId: "other" })],
    isPremium: true,
  };
  data = reduce(data, actions.setPremiumPreview(false));
  assert.equal(data.extraShifts.length, 1);
  data = reduce(
    data,
    actions.clockOutExtraShift(
      model.finishShift(data.extraShifts[0], at("17:00"), data),
    ),
  );
  assert.equal(data.extraShifts.length, 0);
  assert.equal(data.history[0].id, "extra");
});
test("Save Defaults strips daily end-time mode and target", () => {
  const data = reduce(
    {
      ...initial,
      todayPlan: plan({
        plannedHours: 7,
        planningMode: "end-time",
        plannedClockOut: "16:30",
      }),
    },
    actions.savePlanAsDefault(),
  );
  assert.equal(data.defaultPlan.plannedHours, 7);
  assert.equal(data.defaultPlan.planningMode, "duration");
  assert.equal(data.defaultPlan.plannedClockOut, null);
  assert.equal(data.todayPlan.plannedClockOut, "16:30");
});
test("daily pay snapshot survives backup and rejects invalid imported overtime", () => {
  const entry = model.finishShift(
    shift(),
    at("18:00"),
    {
      ...initial,
      todayPlan: plan({
        overtimeThreshold: 6,
        overtimeMultiplier: 2,
        hourlyRate: 30,
      }),
    },
    true,
  );
  const data = { ...initial, history: [entry] },
    text = backupText(data);
  const restored = parseBackup(text, "backup.json", initial).history[0];
  assert.equal(wagesFor(restored, initial.jobs, initial.defaultPlan), 360);
  const bad = JSON.parse(text);
  bad.history[0].overtimeMultiplier = Infinity;
  // JSON encodes Infinity as null; a finite but invalid multiplier must also be rejected.
  bad.history[0].overtimeMultiplier = 5;
  assert.throws(
    () => parseBackup(JSON.stringify(bad), "backup.json", initial),
    /overtime/,
  );
});
test("no-lunch plan suppresses lunch alerts and stops rearming after lunch ends", () => {
  const job = {
    ...initial.jobs[0],
    reminderSettings: initial.preferences.defaultReminders,
    lunchEnabled: false,
  };
  assert.equal(
    jobAlerts(shift(), job).some((item) => item.key.includes(":lunch:")),
    false,
  );
  assert.equal(
    jobAlerts(shift({ lunchMinutes: 30 }), { ...job, lunchEnabled: true }).some(
      (item) => item.key.includes(":lunch:"),
    ),
    false,
  );
});
test("failed durable completion leaves active session and history untouched", async () => {
  let data = { ...initial, activeShift: shift() },
    dispatched = false;
  const action = actions.clockOut(
    model.finishShift(data.activeShift, at("17:00"), data, true),
  );
  await assert.rejects(
    commitTrackerAction(action, {
      read: () => data,
      write: async () => {
        throw new Error("disk full");
      },
      dispatch: (next) => {
        dispatched = true;
        data = reduce(data, next);
      },
    }),
    /disk full/,
  );
  assert.equal(dispatched, false);
  assert.equal(data.activeShift.id, "shift");
  assert.equal(data.history.length, 0);
});
test("durable completion persists history before clearing active state and preserves unrelated edits", async () => {
  let data = { ...initial, activeShift: shift() },
    persisted;
  const action = actions.clockOut(
    model.finishShift(data.activeShift, at("17:00"), data, true),
  );
  const saved = await commitTrackerAction(action, {
    read: () => data,
    write: async (proposed) => {
      assert.ok(data.activeShift);
      persisted = proposed;
      data = { ...data, payVisible: true };
    },
    dispatch: (next) => {
      data = reduce(data, next);
    },
  });
  assert.equal(saved, true);
  assert.equal(persisted.activeShift, null);
  assert.equal(persisted.history.length, 1);
  assert.equal(data.activeShift, null);
  assert.equal(data.history.length, 1);
  assert.equal(data.payVisible, true);
});
test("stale completion does not write a duplicate snapshot", async () => {
  const data = { ...initial, history: [shift({ endedAt: at("17:00") })] };
  let writes = 0;
  const saved = await commitTrackerAction(actions.clockOut(data.history[0]), {
    read: () => data,
    write: async () => {
      writes++;
    },
    dispatch: () => {},
  });
  assert.equal(saved, false);
  assert.equal(writes, 0);
});
test("overnight manual interval follows calendar days across daylight-saving boundaries", () => {
  const date = "2026-03-07",
    source = shift({ date, startedAt: at("22:00", date) });
  const result = model.manualShift(
    source,
    times({ start: "22:00", end: "06:00" }),
  ).shift;
  const duration =
    (Date.parse(at("06:00", "2026-03-08")) - Date.parse(at("22:00", date))) /
    60000;
  assert.equal(workedMinutes(result), duration);
});
test("a new tracker day clears yesterday overrides while retaining history and job defaults", () => {
  const before = {
    ...initial,
    trackerDay: "2026-10-19",
    todayPlan: plan({ plannedHours: 6 }),
    history: [shift({ endedAt: at("17:00") })],
    reminders: { ...initial.reminders, customReminderMinutes: 12 },
  };
  const after = reduce(before, actions.refreshTrackerDay("2026-10-20"));
  assert.equal(after.todayPlan.plannedHours, 8);
  assert.equal(after.reminders.customReminderMinutes, null);
  assert.equal(after.trackerDay, "2026-10-20");
  assert.deepEqual(after.history, before.history);
});
test("day refresh never resets the plan of a running overnight shift", () => {
  const before = {
    ...initial,
    trackerDay: "2026-10-19",
    activeShift: shift(),
    todayPlan: plan({ plannedHours: 6 }),
  };
  assert.deepEqual(
    reduce(before, actions.refreshTrackerDay("2026-10-20")),
    before,
  );
});
test("same-day or invalid day refresh cannot discard current overrides", () => {
  const before = {
    ...initial,
    trackerDay: "2026-10-20",
    todayPlan: plan({ plannedHours: 6 }),
  };
  assert.deepEqual(
    reduce(before, actions.refreshTrackerDay("2026-10-20")),
    before,
  );
  assert.deepEqual(reduce(before, actions.refreshTrackerDay("bad")), before);
});
test("hydration retains both legacy unfinished sessions instead of overwriting an orphan", () => {
  const active = shift(),
    orphan = shift({
      id: "older-orphan",
      date: "2026-10-18",
      startedAt: at("09:00", "2026-10-18"),
    });
  const data = reduce(
    initial,
    actions.hydrate({ ...initial, activeShift: active, orphanedShift: orphan }),
  );
  // Both dates precede this audit's current day; one is recoverable and the other remains completable.
  assert.equal(data.orphanedShift.id, active.id);
  assert.equal(
    data.extraShifts.some((item) => item.id === orphan.id),
    true,
  );
});
