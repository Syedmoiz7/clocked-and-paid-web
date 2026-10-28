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
const { initialAppState } = require("../src/store/appSlice.ts");
const { reminderDefaults } = require("../src/features/jobs/model.ts");
const {
  workspaceReminderRules,
  nextDueReminder,
} = require("../src/features/jobs/reminders.ts");
const start = new Date("2026-10-28T09:00:00").toISOString();
const reminder = (id, priority = "medium") => ({
  id,
  name: id,
  message: id,
  enabled: true,
  trigger: "after-clock-in",
  offsetMinutes: 1,
  atTime: "12:00",
  repeatMinutes: 0,
  priority,
});
const job = (id, custom = []) => ({
  id,
  name: id,
  color: "#d65c90",
  hourlyRate: 24,
  reminderSettings: { ...reminderDefaults(), custom },
});
const shift = (id, jobId) => ({
  id,
  jobId,
  date: "2026-10-28",
  startedAt: start,
  endedAt: null,
  lunchMinutes: 0,
  breakMinutes: 0,
  earnings: 0,
});
const workspace = (changes = {}) => ({
  ...structuredClone(initialAppState),
  activeShift: shift("primary", "a"),
  jobs: [
    job("a", [reminder("primary-reminder")]),
    job("b", [reminder("extra-reminder", "high")]),
  ],
  extraShifts: [shift("extra", "b")],
  ...changes,
});

test("web reminder host includes primary and additional work exactly once", () => {
  const state = workspace();
  state.reminders.lunchReminder = false;
  const rules = workspaceReminderRules(state);
  assert.deepEqual(rules.map((rule) => rule.shiftId).sort(), [
    "extra",
    "primary",
  ]);
  assert.equal(new Set(rules.map((rule) => rule.key)).size, 2);
  assert.equal(
    nextDueReminder(state, rules, Date.parse(start) + 60000).name,
    "extra-reminder",
  );
});

test("an unassigned resumed primary shift retains selected-profile reminders", () => {
  const state = workspace({ extraShifts: [], selectedJobId: "a" });
  state.activeShift.jobId = null;
  state.reminders.lunchReminder = false;
  const rules = workspaceReminderRules(state);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].jobId, "a");
  assert.equal(rules[0].shiftId, "primary");
});
test("primary effects follow session overrides while additional work keeps its job settings", () => {
  const state = workspace();
  Object.assign(state.reminders, {
    lunchReminder: false,
    reminderSound: false,
    reminderOverlay: false,
    reminderTabFlash: false,
    reminderSnoozeMinutes: 7,
  });
  const rules = workspaceReminderRules(state),
    primary = rules.find((rule) => rule.shiftId === "primary"),
    extra = rules.find((rule) => rule.shiftId === "extra");
  assert.equal(primary.settings.sound, false);
  assert.equal(primary.settings.overlay, false);
  assert.equal(primary.settings.indicator, false);
  assert.equal(primary.settings.snoozeMinutes, 7);
  assert.equal(extra.settings.sound, true);
  assert.equal(extra.settings.overlay, true);
});
test("dismissal, legacy dismissals and snooze suppress due reminders without resetting timestamps", () => {
  const state = workspace({ extraShifts: [] });
  state.reminders.lunchReminder = false;
  const rules = workspaceReminderRules(state),
    key = rules[0].key,
    now = Date.parse(start) + 60000;
  assert.equal(nextDueReminder(state, rules, now - 1), null);
  assert.ok(nextDueReminder(state, rules, now));
  for (const dismissed of [-1, Number.MAX_SAFE_INTEGER]) {
    state.jobReminderAcknowledgements[key] = dismissed;
    assert.equal(nextDueReminder(state, rules, now + 100000), null);
  }
  state.jobReminderAcknowledgements[key] = now + 300000;
  assert.equal(nextDueReminder(state, rules, now + 299999), null);
  assert.equal(nextDueReminder(state, rules, now + 300000).key, key);
});
test("finished and missing-job sessions do not produce web alerts", () => {
  const state = workspace();
  state.activeShift.endedAt = start;
  state.extraShifts[0].jobId = "missing";
  assert.deepEqual(workspaceReminderRules(state), []);
});
test("session custom reminder belongs only to primary work and priority wins over earlier low alerts", () => {
  const state = workspace();
  state.reminders.lunchReminder = false;
  state.reminders.customReminderMinutes = 2;
  state.jobs[0].reminderSettings.custom[0].priority = "low";
  const rules = workspaceReminderRules(state);
  assert.equal(
    rules.filter((rule) => rule.key.endsWith(":session-custom")).length,
    1,
  );
  assert.equal(
    nextDueReminder(state, rules, Date.parse(start) + 120000).name,
    "extra-reminder",
  );
});
