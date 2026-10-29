import { test, expect, type Page } from "./helpers/guest";
import { readFile } from "node:fs/promises";
import type { AppState, Shift } from "../src/types";
test.use({ timezoneId: "Asia/Karachi" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00+05:00"));
});

async function addShift(
  page: Page,
  date = "2026-10-28",
  start = "09:00",
  end = "17:00",
) {
  await page.getByRole("button", { name: "Add shift", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Date", { exact: true }).fill(date);
  if (start) await dialog.getByLabel("Clock in", { exact: true }).fill(start);
  if (end) await dialog.getByLabel("Clock out", { exact: true }).fill(end);
  return dialog;
}
async function premium(page: Page) {
  await page.getByRole("link", { name: "See plans", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Start Premium preview (no charge)",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/history$/);
}

// Disposable fixtures for receipt/schedule surfaces whose editors belong to W3.
async function seedWorkspace(page: Page, changes: Partial<AppState>) {
  await page.evaluate(async (changes) => {
    const request = indexedDB.open("clocked-paid-web", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("workspace", "readwrite"),
      store = tx.objectStore("workspace");
    const read = store.get("current");
    read.onsuccess = () => {
      const snapshot = read.result;
      snapshot.state = { ...snapshot.state, ...changes };
      snapshot.revision++;
      store.put(snapshot, "current");
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, changes);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Work History", exact: true }),
  ).toBeVisible();
}
const recordedShift = (changes: Partial<Shift> = {}): Shift => ({
  id: "recorded-shift",
  date: "2026-10-28",
  jobId: "default",
  currency: "USD",
  startedAt: "2026-10-28T09:00:00+05:00",
  endedAt: "2026-10-28T17:00:00+05:00",
  lunchMinutes: 30,
  breakMinutes: 15,
  earnings: 174,
  customRate: 24,
  tips: 0,
  historyLunchStart: "2026-10-28T12:00:00+05:00",
  historyLunchEnd: "2026-10-28T12:30:00+05:00",
  breaks: [
    {
      id: "break-1",
      start: "2026-10-28T10:00:00+05:00",
      end: "2026-10-28T10:15:00+05:00",
      label: "Water break",
    },
  ],
  ...changes,
});

test("History edits, tips and lunch/break pay persist and update Tracker", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/history");
  await page.getByRole("switch", { name: "Show Pay", exact: true }).click();
  const dialog = await addShift(page);
  await dialog.getByLabel("Recorded lunch (minutes)").fill("30");
  await dialog.getByLabel("Unpaid breaks (minutes)").fill("15");
  await dialog.getByLabel("Tips earned").fill("10");
  await dialog.getByLabel("Notes (optional)").fill("Morning shift");
  await dialog
    .getByRole("button", { name: "Save completed shift", exact: true })
    .click();
  await expect(page.locator(".history-entry")).toHaveCount(1);
  await expect(page.locator(".entry-amount>strong")).toHaveText("$184.00");
  await page.locator(".entry-details>summary").click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Clock out", { exact: true })
    .fill("18:00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".entry-amount>strong")).toHaveText("$211.00");
  await page.getByRole("link", { name: "Tracker", exact: true }).click();
  await expect(page.locator(".summary-amount")).toHaveText("$211.00");
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(
    page.getByRole("heading", { name: "Work History", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("switch", { name: "Show Pay", exact: true }).click();
  await expect(page.locator(".entry-amount>strong")).toHaveText("$211.00");
  await page.locator(".entry-details>summary").click();
  await expect(page.locator(".entry-notes")).toHaveText("Morning shift");
  await page.getByRole("button", { name: "Mark paid", exact: true }).click();
  await expect(page.locator(".payment-badge")).toHaveText("Paid");
  await page.getByRole("button", { name: "More filters", exact: true }).click();
  await page.getByRole("switch", { name: "Unpaid entries only" }).check();
  await expect(page.locator(".history-entry")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("last-week and custom dates filter inclusively; CSV exports only matching saved entries", async ({
  page,
}) => {
  await page.goto("/history");
  let dialog = await addShift(page, "2026-10-28");
  await dialog
    .getByRole("button", { name: "Save completed shift", exact: true })
    .click();
  dialog = await addShift(page, "2026-10-23");
  await dialog.getByLabel("Notes (optional)").fill("=SUM(A1:A2)");
  await dialog
    .getByRole("button", { name: "Save completed shift", exact: true })
    .click();
  await page.getByRole("button", { name: "Last week", exact: true }).click();
  await expect(page.locator(".range-label")).toHaveText(
    "Last week · Oct 19, 2026 – Oct 25, 2026",
  );
  await expect(page.locator(".history-entry")).toHaveCount(1);
  await expect(page.locator(".history-entry")).toContainText("Oct 23");
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("From date").fill("2026-10-29");
  await page.getByLabel("To date").fill("2026-10-30");
  await expect(
    page.getByRole("heading", { name: "No matching entries" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "This month", exact: true }).click();
  await expect(page.locator(".history-entry")).toHaveCount(2);
  await premium(page);
  await page.getByRole("button", { name: "Last week", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export filtered history (CSV)", exact: true })
    .click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("2026-10-23");
  expect(csv).not.toContain("2026-10-28");
  expect(csv).toContain("'=SUM(A1:A2)");
});

test("Free hides older entries and Calendar, Premium reveals them, and downgrade retains data", async ({
  page,
}) => {
  await page.goto("/history");
  const dialog = await addShift(page, "2026-09-15");
  await dialog
    .getByRole("button", { name: "Save completed shift", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".history-entry")).toHaveCount(0);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".history-calendar")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Full History & Calendar", exact: true }),
  ).toBeVisible();
  await premium(page);
  await expect(page.locator(".history-entry")).toHaveCount(1);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".history-calendar")).toBeVisible();
  await page
    .getByRole("link", { name: "Premium preview", exact: true })
    .click();
  await page.getByRole("button", { name: "Use Free", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.locator(".history-entry")).toHaveCount(0);
  await premium(page);
  await expect(page.locator(".history-entry")).toHaveCount(1);
});

test("bulk payment excludes projects and incomplete work; deletion recalculates saved totals", async ({
  page,
}) => {
  await page.goto("/history");
  let dialog = await addShift(page);
  await dialog
    .getByRole("button", { name: "Save completed shift", exact: true })
    .click();
  dialog = await addShift(page, "2026-10-28", "08:00", "");
  await dialog
    .getByRole("button", { name: "Save incomplete entry", exact: true })
    .click();
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Project name").fill("Logo work");
  await dialog.getByLabel("Flat payout").fill("100");
  await dialog
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await expect(page.locator(".history-entry")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Select shifts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Select all eligible (1)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mark selected paid", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm mark paid", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".history-entry .payment-badge", { hasText: /^Paid$/ }),
  ).toHaveCount(1);
  await expect(
    page.locator(".history-entry .payment-badge", { hasText: /^Incomplete$/ }),
  ).toHaveCount(1);
  const project = page.locator(".project-entry");
  await expect(project.getByRole("checkbox")).toBeDisabled();
  await project.locator("summary").click();
  await project.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete entry", exact: true }).click();
  await expect(page.locator(".history-entry")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".history-entry")).toHaveCount(2);
});

test("Calendar modes handle project currency, daily selection, yearly breakdown and summary", async ({
  page,
}) => {
  await page.goto("/history");
  await premium(page);
  await page.getByRole("switch", { name: "Show Pay", exact: true }).click();
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Start date").fill("2026-10-28");
  await dialog.getByLabel("End date").fill("2026-10-30");
  await dialog.getByLabel("Project name").fill("Design delivery");
  await dialog.getByLabel("Flat payout").fill("100");
  await dialog
    .getByRole("combobox", { name: "Currency", exact: true })
    .selectOption("EUR");
  await dialog
    .getByRole("button", { name: "Save project", exact: true })
    .click();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.locator(".calendar-months>.calendar-group")).toHaveCount(
    12,
  );
  await page
    .locator(".calendar-group")
    .filter({
      has: page.getByRole("heading", { name: "October", exact: true }),
    })
    .locator(":scope>summary")
    .click();
  await expect(page.locator(".calendar-entry-link")).toHaveText(
    /2026-10-28.*Design delivery.*€100.00/,
  );
  await page.getByRole("button", { name: "Daily", exact: true }).click();
  await page
    .getByRole("button", { name: "View 2026-10-29", exact: true })
    .click();
  await expect(page.locator(".calendar-group-entries")).toHaveText(
    "No entries for this period.",
  );
  await page
    .getByRole("button", { name: "View 2026-10-28, 1 entry", exact: true })
    .click();
  await expect(page.locator(".calendar-entry-link")).toHaveCount(1);
  await page.getByRole("button", { name: "Weekly", exact: true }).click();
  await expect(page.locator(".calendar-group")).toHaveCount(53);
  await page.getByRole("button", { name: "Yearly", exact: true }).click();
  await page.locator(".calendar-group>summary").first().click();
  await expect(
    page.getByRole("heading", { name: "Month breakdown" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Summary", exact: true }).click();
  await page.getByLabel("Summary from").fill("2026-10-28");
  await page.getByLabel("Summary to").fill("2026-10-28");
  await expect(
    page.getByRole("heading", { name: "Earnings breakdown by job" }),
  ).toBeVisible();
  await expect(page.locator(".history-calendar")).toContainText("EUR");
  await page.getByRole("button", { name: "Pay Periods", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a job", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Calendar job", exact: true })
    .selectOption("default");
  await expect(
    page.getByRole("heading", {
      name: "No pay schedule for this job",
      exact: true,
    }),
  ).toBeVisible();
});

test("a current-day incomplete entry resumes in Tracker and live filters never duplicate it", async ({
  page,
}) => {
  await page.goto("/history");
  const dialog = await addShift(page, "2026-10-28", "08:00", "");
  await dialog
    .getByRole("button", { name: "Save incomplete entry", exact: true })
    .click();
  await page.locator(".entry-details>summary").click();
  await expect(
    page.getByRole("button", { name: "Mark paid", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Resume in Tracker", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tracker$/);
  await expect(
    page.getByRole("button", { name: "Clock out", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page.locator(".history-entry")).toHaveCount(1);
  await expect(page.locator(".payment-badge")).toHaveText("Running");
  await page.clock.setFixedTime(new Date("2026-10-28T14:00:00+05:00"));
  await expect(page.locator(".reminder-alert")).toContainText(
    "Lunch break reminder",
  );
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.locator(".reminder-alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Last week", exact: true }).click();
  await expect(page.locator(".history-entry")).toHaveCount(0);
});

test("stale edits cannot overwrite another browser tab's correction", async ({
  page,
  context,
}) => {
  await page.goto("/history");
  const added = await addShift(page);
  await added
    .getByRole("button", { name: "Save completed shift", exact: true })
    .click();
  await page.locator(".entry-details>summary").click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Notes (optional)")
    .fill("My unsaved note");
  const other = await context.newPage();
  await other.clock.setFixedTime(new Date("2026-10-28T12:00:00+05:00"));
  await other.goto("/history");
  await other.locator(".entry-details>summary").click();
  await other.getByRole("button", { name: "Edit", exact: true }).click();
  await other
    .getByRole("dialog")
    .getByLabel("Notes (optional)")
    .fill("Saved from second tab");
  await other
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(other.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Entry not saved",
  );
  await expect(
    page.getByRole("dialog").getByLabel("Notes (optional)"),
  ).toHaveValue("My unsaved note");
  await expect(page.locator(".toast")).toContainText(
    "changed while the form was open",
  );
});

test("failed History save preserves form inputs and does not add a record", async ({
  page,
}) => {
  await page.goto("/history");
  const dialog = await addShift(page);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Storage is full", "QuotaExceededError");
    };
  });
  await dialog
    .getByRole("button", { name: "Save completed shift", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Entry not saved");
  await expect(dialog.getByLabel("Clock in", { exact: true })).toHaveValue(
    "09:00",
  );
  await expect(page.locator(".history-entry")).toHaveCount(0);
});

test("receipt-covered work cannot be marked paid manually and corrections preserve recorded breaks", async ({
  page,
}) => {
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "Work History", exact: true }),
  ).toBeVisible();
  await seedWorkspace(page, {
    history: [recordedShift()],
    paychecks: [
      {
        id: "receipt",
        jobId: "default",
        currency: "USD",
        startDate: "2026-10-28",
        endDate: "2026-10-28",
        paid: true,
        grossPay: 174,
        totalDeductions: 0,
        netPay: 174,
      },
    ],
  });
  await expect(page.locator(".payment-badge")).toHaveText("Paid via Paycheck");
  await page
    .getByRole("button", { name: "Select shifts", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Select all eligible (0)", exact: true }),
  ).toBeDisabled();
  await page.locator(".entry-details>summary").click();
  await expect(
    page.getByRole("button", { name: "Mark paid", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("switch", { name: "Payment received" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", {
      name: "Replace recorded breaks with total minutes",
      exact: true,
    }),
  ).toBeVisible();
  await dialog.getByLabel("Clock out", { exact: true }).fill("18:00");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Water break");
  await expect(
    page.getByRole("dialog").getByRole("button", {
      name: "Replace recorded breaks with total minutes",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".payment-badge")).toHaveText("Paid via Paycheck");
});

test("anchored Calendar pay periods include saved work beyond the displayed month's boundary", async ({
  page,
}) => {
  await page.goto("/history");
  await premium(page);
  await seedWorkspace(page, {
    jobs: [
      {
        id: "default",
        name: "Default job",
        hourlyRate: 24,
        color: "#d65c90",
        currency: "USD",
        payFrequency: "biweekly",
        payPeriodStart: "2026-10-19",
      },
    ],
    history: [
      recordedShift(),
      recordedShift({
        id: "november-work",
        date: "2026-11-01",
        startedAt: "2026-11-01T09:00:00+05:00",
        endedAt: "2026-11-01T10:00:00+05:00",
        lunchMinutes: 0,
        breakMinutes: 0,
        breaks: [],
        historyLunchStart: null,
        historyLunchEnd: null,
      }),
    ],
  });
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Pay Periods", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Calendar job", exact: true })
    .selectOption("default");
  const group = page.locator(".calendar-group").filter({
    has: page.getByRole("heading", {
      name: "2026-10-19 → 2026-11-01",
      exact: true,
    }),
  });
  await group.locator(":scope>summary").click();
  await expect(group.locator(".calendar-entry-link")).toHaveCount(2);
  await expect(group).toContainText("2026-11-01");
});

test("net/tips views isolate currency ledgers and clear competing earnings options", async ({
  page,
}) => {
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "Work History", exact: true }),
  ).toBeVisible();
  await seedWorkspace(page, {
    history: [
      recordedShift({
        lunchMinutes: 0,
        breakMinutes: 0,
        breaks: [],
        historyLunchStart: null,
        historyLunchEnd: null,
        tips: 10,
      }),
      recordedShift({
        id: "eur-project",
        entryType: "project",
        projectName: "Euro project",
        flatAmount: 100,
        currency: "EUR",
        endedAt: null,
        lunchMinutes: 0,
        breakMinutes: 0,
        breaks: [],
        tips: 0,
      }),
    ],
    deductions: [
      {
        id: "flat",
        label: "Daily expense",
        amount: 12,
        frequency: "daily",
        currency: "USD",
        enabled: true,
      },
      {
        id: "percentage",
        label: "Percent",
        amount: 5,
        isPercentage: true,
        frequency: "daily",
        enabled: true,
      },
    ],
  });
  await page.getByRole("switch", { name: "Show Pay", exact: true }).click();
  await page.getByRole("button", { name: "More filters", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Earnings view", exact: true })
    .selectOption("net");
  await expect(
    page
      .locator(".history-totals>section")
      .filter({ hasText: "USD" })
      .locator(".summary-amount"),
    // Match mobile's date proration: daily flat amount uses 260 annual workdays / 365.
  ).toHaveText("$183.35");
  await expect(
    page
      .locator(".history-totals>section")
      .filter({ hasText: "EUR" })
      .locator(".summary-amount"),
  ).toHaveText("€95.00");
  await page
    .getByRole("switch", { name: "Exclude tips from displayed earnings" })
    .check();
  await page
    .getByRole("combobox", { name: "Earnings view", exact: true })
    .selectOption("tips");
  await expect(
    page
      .locator(".history-totals>section")
      .filter({ hasText: "USD" })
      .locator(".summary-amount"),
  ).toHaveText("$10.00");
  await page
    .getByRole("combobox", { name: "Earnings view", exact: true })
    .selectOption("all");
  await expect(
    page.getByRole("switch", { name: "Exclude tips from displayed earnings" }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Hide filters", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/private/tmp/clocked-paid-web-history-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".page-heading")).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/private/tmp/clocked-paid-web-history-mobile.png",
    fullPage: false,
  });
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    elements: [...document.querySelectorAll("main *")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right > window.innerWidth + 1,
      )
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        width: element.getBoundingClientRect().width,
      }))
      .slice(0, 16),
  }));
  expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(
    overflow.viewport,
  );
});
