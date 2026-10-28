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
const { defaultFilters } = require("../src/features/history/model.ts");
const {
  calendarGroups,
  selectedRange,
  rangeLabel,
  newestFirst,
  savedCalendarEntries,
} = require("../src/features/history/viewModel.ts");
const entry = (id, date, changes = {}) => ({
  id,
  date,
  startedAt: `${date}T09:00:00`,
  endedAt: `${date}T17:00:00`,
  lunchMinutes: 0,
  breakMinutes: 0,
  earnings: 192,
  jobId: "default",
  ...changes,
});
const filters = (period) => ({ ...defaultFilters(), period });
test("History labels expose previous Monday–Sunday, including year boundaries", () => {
  const now = new Date("2027-01-03T12:00:00");
  assert.deepEqual(selectedRange(filters("week"), now), {
    start: "2026-12-28",
    end: "2027-01-03",
  });
  assert.deepEqual(selectedRange(filters("lastWeek"), now), {
    start: "2026-12-21",
    end: "2026-12-27",
  });
  assert.match(
    rangeLabel(filters("lastWeek"), now),
    /Last week.*Dec 21, 2026.*Dec 27, 2026/,
  );
});
test("History month/year/custom labels use inclusive calendar bounds", () => {
  const now = new Date("2028-02-29T12:00:00");
  assert.deepEqual(selectedRange(filters("month"), now), {
    start: "2028-02-01",
    end: "2028-02-29",
  });
  assert.deepEqual(selectedRange(filters("year"), now), {
    start: "2028-01-01",
    end: "2028-12-31",
  });
  assert.deepEqual(
    selectedRange(
      { ...filters("custom"), from: "2028-02-29", to: "2028-02-29" },
      now,
    ),
    { start: "2028-02-29", end: "2028-02-29" },
  );
  assert.equal(
    selectedRange(
      { ...filters("custom"), from: "2028-03-01", to: "2028-02-29" },
      now,
    ),
    null,
  );
  assert.match(
    rangeLabel({ ...filters("custom"), from: "bad" }, now),
    /valid custom date range/,
  );
});
test("Calendar excludes all live IDs, filters jobs and sorts without mutating history", () => {
  const a = entry("a", "2026-10-26"),
    b = entry("b", "2026-10-28"),
    c = entry("c", "2026-10-27", { jobId: "other" });
  const history = [a, b, c];
  const data = {
    ...initialAppState,
    history,
    activeShift: b,
    extraShifts: [c],
  };
  assert.deepEqual(savedCalendarEntries(data, ""), [a]);
  assert.deepEqual(
    savedCalendarEntries(
      { ...data, activeShift: null, extraShifts: [] },
      "default",
    ),
    [b, a],
  );
  assert.deepEqual(history, [a, b, c]);
  assert.deepEqual(newestFirst(history), [b, c, a]);
});
test("same-day History sorting compares actual timestamps across offset formats", () => {
  const earlier = entry("earlier", "2026-10-28", {
    startedAt: "2026-10-28T07:00:00+05:00",
  });
  const later = entry("later", "2026-10-28", {
    startedAt: "2026-10-28T03:00:00Z",
  });
  assert.deepEqual(newestFirst([earlier, later]), [later, earlier]);
});
test("Calendar month/year/summary groups assign projects once by start date", () => {
  const project = entry("p", "2026-10-28", {
    entryType: "project",
    endDate: "2026-11-02",
    flatAmount: 100,
    endedAt: null,
  });
  const data = { ...initialAppState, history: [project] };
  const months = calendarGroups(
    "monthly",
    2026,
    9,
    "",
    data.history,
    data,
    "",
    "",
    "",
  );
  assert.equal(months.length, 12);
  assert.equal(months[9].entries.length, 1);
  assert.equal(months[10].entries.length, 0);
  assert.equal(
    calendarGroups("yearly", 2026, 9, "", data.history, data, "", "", "")[0]
      .entries.length,
    1,
  );
  assert.equal(
    calendarGroups(
      "summary",
      2026,
      9,
      "",
      data.history,
      data,
      "",
      "2026-10-28",
      "2026-10-28",
    )[0].entries.length,
    1,
  );
  assert.equal(
    calendarGroups(
      "summary",
      2026,
      9,
      "",
      data.history,
      data,
      "",
      "2026-11-01",
      "2026-10-01",
    ).length,
    0,
  );
});
test("Calendar weekly groups cover year edges without duplicating an entry", () => {
  const history = [
    entry("dec", "2026-12-31"),
    entry("jan", "2027-01-01"),
    entry("end", "2027-12-31"),
  ];
  const groups = calendarGroups(
    "weekly",
    2027,
    0,
    "",
    history,
    initialAppState,
    "",
    "",
    "",
  );
  assert.ok(groups.length >= 52 && groups.length <= 54);
  for (const item of history)
    assert.equal(
      groups
        .flatMap((group) => group.entries)
        .filter((row) => row.id === item.id).length,
      1,
    );
  assert.ok(
    groups.every((group) => new Date(`${group.start}T12:00:00`).getDay() === 1),
  );
});
test("Calendar pay periods include full boundary-spanning periods and require a configured job", () => {
  const history = [entry("oct", "2026-10-31"), entry("nov", "2026-11-01")];
  const data = {
    ...initialAppState,
    jobs: [
      {
        ...initialAppState.jobs[0],
        payFrequency: "biweekly",
        payPeriodStart: "2026-10-19",
      },
    ],
    history,
  };
  const groups = calendarGroups(
    "payperiods",
    2026,
    9,
    "",
    history,
    data,
    "default",
    "",
    "",
  );
  const last = groups.find((group) => group.start === "2026-10-19");
  assert.equal(last.end, "2026-11-01");
  assert.deepEqual(last.entries, history);
  assert.equal(
    calendarGroups("payperiods", 2026, 9, "", history, data, "", "", "").length,
    0,
  );
});
