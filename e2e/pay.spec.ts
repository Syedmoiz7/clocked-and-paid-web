import { test, expect, type Page } from "./helpers/guest";
import type { AppState, Shift } from "../src/types";

test.use({ timezoneId: "Asia/Karachi" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00+05:00"));
  await page.goto("/pay");
  await expect(
    page.getByRole("heading", { name: "Pay", exact: true }),
  ).toBeVisible();
});
const shift = (changes: Partial<Shift> = {}): Shift => ({
  id: "shift",
  date: "2026-10-28",
  jobId: "default",
  currency: "USD",
  startedAt: "2026-10-28T09:00:00+05:00",
  endedAt: "2026-10-28T17:00:00+05:00",
  lunchMinutes: 0,
  breakMinutes: 0,
  earnings: 192,
  customRate: 24,
  ...changes,
});
// Only disposable browser data. Jobs editing is the next web delivery.
async function seed(page: Page, changes: Partial<AppState>) {
  await page.evaluate(async (changes) => {
    const request = indexedDB.open("clocked-paid-web", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("workspace", "readwrite"),
      store = tx.objectStore("workspace"),
      read = store.get("current");
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
    page.getByRole("heading", { name: "Pay", exact: true }),
  ).toBeVisible();
}
async function showPay(page: Page) {
  await page.getByRole("switch", { name: "Show Pay", exact: true }).click();
}
async function premium(page: Page) {
  await page
    .getByRole("link", { name: "See plans", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Start Premium preview (no charge)" })
    .click();
  await expect(page).toHaveURL(/\/pay$/);
}
async function custom(page: Page, start = "2026-10-28", end = "2026-10-28") {
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("From", { exact: true }).fill(start);
  await page.getByLabel("To", { exact: true }).fill(end);
}
async function deduction(page: Page, name = "Insurance", amount = "10") {
  await page
    .getByRole("button", { name: "+ Add deduction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Percentage", exact: true }).click();
  await dialog.getByLabel("Percentage (%)", { exact: true }).fill(amount);
  return dialog;
}

test("Free has current-period totals, privacy, a working schedule and return-aware Premium gates", async ({
  page,
}) => {
  await seed(page, { history: [shift()] });
  await showPay(page);
  await expect(page.getByTestId("pay-summary")).toContainText("$192.00");
  await page
    .getByRole("button", { name: "Set up pay schedule", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Pay frequency" })
    .selectOption("weekly");
  await dialog.getByLabel("Period start", { exact: true }).fill("2026-10-26");
  await dialog
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".pay-range")).toContainText(
    "2026-10-26 → 2026-11-01",
  );
  await page
    .getByRole("button", { name: "Presets · Premium", exact: true })
    .click();
  await expect(page).toHaveURL(/plans\?returnTo=pay/);
  await page.getByRole("link", { name: "Back to Pay" }).click();
  await expect(
    page.getByRole("heading", { name: "Current Period Pay" }),
  ).toBeVisible();
  await page.getByRole("switch", { name: "Show Pay", exact: true }).click();
  await expect(page.getByTestId("pay-summary")).not.toContainText("$192.00");
});

test("deduction forms validate, reset type input, persist and update estimator without changing work", async ({
  page,
}) => {
  await seed(page, { history: [shift()], isPremium: true });
  await showPay(page);
  await custom(page);
  let dialog = await deduction(page);
  await dialog
    .getByRole("button", { name: "Flat amount", exact: true })
    .click();
  await expect(dialog.getByLabel("Amount (USD)", { exact: true })).toHaveValue(
    "",
  );
  await dialog.getByRole("button", { name: "Percentage", exact: true }).click();
  await dialog.getByLabel("Percentage (%)", { exact: true }).fill("101");
  await dialog
    .getByRole("button", { name: "Save deduction", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("100%");
  await dialog.getByLabel("Percentage (%)", { exact: true }).fill("10");
  await dialog
    .getByRole("button", { name: "Save deduction", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("pay-summary")).toContainText("$172.80");
  await page
    .getByRole("switch", { name: "Override deductions manually", exact: true })
    .check();
  await expect(page.locator(".pay-estimator")).toContainText(
    "Enter valid deductions",
  );
  await page.getByLabel("Deduction amount", { exact: true }).fill("20");
  await expect(page.locator(".pay-estimator")).toContainText("$172.00");
  await page.getByRole("button", { name: "Percentage", exact: true }).click();
  await expect(
    page.getByLabel("Deduction percentage", { exact: true }),
  ).toHaveValue("");
  await page.reload();
  await showPay(page);
  await custom(page);
  await expect(page.getByTestId("pay-summary")).toContainText("$172.80");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "History", exact: true })
    .click();
  await expect(page.locator(".history-entry")).toHaveCount(1);
  await expect(page.locator(".history-entry")).toContainText("8h");
});

test("received amounts start blank, dates clear amounts, overlap is rejected, undo restores History", async ({
  page,
}) => {
  await seed(page, { history: [shift()], isPremium: true });
  await showPay(page);
  await custom(page);
  await page
    .getByRole("button", { name: "Record a received paycheck", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("Actual gross pay", { exact: true }),
  ).toHaveValue("");
  await expect(dialog.getByLabel("Received on", { exact: true })).toHaveValue(
    "2026-10-28",
  );
  await dialog
    .getByRole("button", { name: "Copy tracked estimate into actual amounts" })
    .click();
  await expect(
    dialog.getByLabel("Actual gross pay", { exact: true }),
  ).toHaveValue("192.00");
  await dialog.getByLabel("Period start", { exact: true }).fill("2026-10-27");
  await expect(
    dialog.getByLabel("Actual gross pay", { exact: true }),
  ).toHaveValue("");
  await dialog.getByLabel("Actual gross pay", { exact: true }).fill("200");
  await dialog.getByLabel("Actual deductions", { exact: true }).fill("20");
  await dialog
    .getByRole("button", { name: "Confirm received paycheck", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("pay-summary")).toContainText(
    "confirmed paycheck history",
  );
  await page
    .getByRole("button", { name: "Record a received paycheck", exact: true })
    .click();
  await dialog.getByLabel("Actual gross pay", { exact: true }).fill("200");
  await dialog.getByLabel("Actual deductions", { exact: true }).fill("20");
  await dialog
    .getByRole("button", { name: "Confirm received paycheck", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("already covers");
  await expect(
    dialog.getByLabel("Actual gross pay", { exact: true }),
  ).toHaveValue("200");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "History", exact: true })
    .click();
  await expect(page.locator(".history-entry")).toContainText(
    "Paid via Paycheck",
  );
  await page.getByRole("link", { name: "Pay", exact: true }).click();
  await page
    .getByRole("button", { name: "Undo received paycheck", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Undo paycheck", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "History", exact: true })
    .click();
  await expect(page.locator(".history-entry")).not.toContainText(
    "Paid via Paycheck",
  );
  await expect(page.locator(".history-entry")).toContainText("Unpaid");
});

test("job schedules generate periods and quick mark paid is confirmed without a receipt", async ({
  page,
}) => {
  await premium(page);
  await showPay(page);
  // The first unscheduled-job action is inside Upcoming Paychecks.
  await page
    .locator(".pay-section")
    .filter({ has: page.locator("summary", { hasText: "Upcoming Paychecks" }) })
    .getByRole("button", { name: /^Set up / })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Period start", { exact: true }).fill("2026-10-26");
  await dialog
    .getByRole("combobox", { name: "Pay frequency" })
    .selectOption("weekly");
  await dialog
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect(
    page.locator(".paycheck-card").filter({ hasText: "In progress" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "History", exact: true })
    .click();
  await page.getByRole("button", { name: "Add shift", exact: true }).click();
  await dialog.getByLabel("Clock in", { exact: true }).fill("09:00");
  await dialog.getByLabel("Clock out", { exact: true }).fill("17:00");
  await dialog
    .getByRole("combobox", { name: "Job (optional)", exact: true })
    .selectOption("default");
  await dialog
    .getByRole("button", { name: "Save completed shift", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("link", { name: "Pay", exact: true }).click();
  await page
    .locator(".paycheck-card")
    .filter({ hasText: "In progress" })
    .getByRole("button", { name: "Quick mark unpaid shifts as paid" })
    .click();
  await dialog.getByRole("button", { name: "Mark paid", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo received paycheck" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".paycheck-card").filter({ hasText: "In progress" }),
  ).toContainText("0 unpaid");
});

test("currencies stay separate, projects count in summary and trends but not estimator", async ({
  page,
}) => {
  await seed(page, {
    isPremium: true,
    history: [
      shift(),
      shift({
        id: "eur",
        entryType: "project",
        projectName: "Euro design",
        currency: "EUR",
        flatAmount: 100,
        endedAt: null,
      }),
    ],
  });
  await showPay(page);
  await custom(page);
  await expect(page.getByTestId("pay-summary")).toContainText("$192.00");
  await page
    .getByRole("combobox", { name: "Pay currency", exact: true })
    .selectOption("EUR");
  await expect(page.getByTestId("pay-summary")).toContainText("€100.00");
  await expect(page.getByTestId("pay-summary")).not.toContainText("$192.00");
  await expect(page.locator(".pay-estimator")).toContainText("0 shifts");
  await expect(page.locator(".pay-chart").first()).toContainText("€100.00");
});

test("custom range validation and downgrade never expose an older Free period", async ({
  page,
}) => {
  await seed(page, {
    isPremium: true,
    history: [shift({ date: "2026-09-15" })],
  });
  await showPay(page);
  await custom(page, "2026-09-01", "2026-09-30");
  await expect(page.getByTestId("pay-summary")).toContainText("$192.00");
  await page.getByLabel("From", { exact: true }).fill("2026-11-01");
  await expect(page.locator(".warning[role=alert]")).toContainText(
    "Choose a valid date range",
  );
  await expect(page.getByTestId("pay-summary")).toHaveCount(0);
  await page
    .getByRole("link", { name: "Premium preview", exact: true })
    .click();
  await page.getByRole("button", { name: "Use Free", exact: true }).click();
  await expect(page).toHaveURL(/\/pay$/);
  await expect(page.locator(".pay-range")).toContainText(
    "2026-10-01 → 2026-10-28",
  );
  await expect(page.getByTestId("pay-summary")).toContainText("0 entries");
});

test("one-time deductions are consumed by receipts and released on undo", async ({
  page,
}) => {
  await seed(page, { isPremium: true, history: [shift()] });
  await showPay(page);
  await custom(page);
  const dialog = await deduction(page, "One time", "10");
  await dialog
    .getByRole("combobox", { name: "Frequency", exact: true })
    .selectOption("one-time");
  await dialog
    .getByRole("button", { name: "Save deduction", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "both an applicable start and end",
  );
  await dialog
    .getByLabel("Applicable from", { exact: true })
    .fill("2026-10-28");
  await dialog.getByLabel("Applicable to", { exact: true }).fill("2026-10-28");
  await dialog
    .getByRole("button", { name: "Save deduction", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Record a received paycheck", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Copy tracked estimate into actual amounts" })
    .click();
  await dialog
    .getByRole("button", { name: "Confirm received paycheck", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".pay-deductions")).toContainText(
    "Applied to a received paycheck",
  );
  await page
    .getByRole("button", { name: "Undo received paycheck", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Undo paycheck", exact: true })
    .click();
  await expect(page.locator(".pay-deductions")).not.toContainText(
    "Applied to a received paycheck",
  );
});

test("stale deduction edits cannot overwrite another tab", async ({
  page,
  context,
}) => {
  await seed(page, { isPremium: true });
  let dialog = await deduction(page);
  await dialog
    .getByRole("button", { name: "Save deduction", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const other = await context.newPage();
  await other.goto("/pay");
  await other
    .getByRole("button", { name: "Edit deduction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit deduction", exact: true })
    .click();
  await dialog.getByLabel("Name", { exact: true }).fill("Updated insurance");
  await dialog
    .getByRole("button", { name: "Save deduction", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const otherDialog = other.getByRole("dialog");
  await otherDialog.getByLabel("Name", { exact: true }).fill("Stale change");
  await otherDialog
    .getByRole("button", { name: "Save deduction", exact: true })
    .click();
  await expect(other.getByRole("status")).toContainText(
    "changed in another tab",
  );
  await expect(otherDialog.getByLabel("Name", { exact: true })).toHaveValue(
    "Stale change",
  );
  await other.close();
});

test("failed durable saves preserve draft and never report a saved deduction", async ({
  page,
}) => {
  await seed(page, { isPremium: true });
  const dialog = await deduction(page, "Keep my inputs");
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Storage quota reached", "QuotaExceededError");
    };
  });
  await dialog
    .getByRole("button", { name: "Save deduction", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("not saved");
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue(
    "Keep my inputs",
  );
  await expect(page.locator(".deduction-grid > article")).toHaveCount(0);
});

test("live accrual is counted once, charts honor privacy and narrow layout", async ({
  page,
}) => {
  const active = shift({ id: "active", endedAt: null });
  await seed(page, {
    isPremium: true,
    activeShift: active,
    history: [shift()],
  });
  await showPay(page);
  await expect(page.getByTestId("pay-summary")).toContainText("$264.00");
  await expect(page.getByTestId("pay-summary")).toContainText(
    "1 running shift",
  );
  await expect(page.locator(".pay-estimator")).toContainText("1 shifts");
  await page.clock.setFixedTime(new Date("2026-10-28T13:00:00+05:00"));
  await page.waitForTimeout(1100);
  await expect(page.getByTestId("pay-summary")).toContainText("$288.00");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Tracker", exact: true })
    .click();
  await page.getByRole("button", { name: "Clock out", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Completed Today (2)", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Pay", exact: true })
    .click();
  await expect(page.getByTestId("pay-summary")).toContainText("$288.00");
  await expect(page.getByTestId("pay-summary")).not.toContainText(
    "Live pay accruing",
  );
  await page.getByRole("switch", { name: "Show Pay", exact: true }).click();
  await expect(page.locator(".pay-chart").first()).not.toContainText("$192.00");
  await page.screenshot({
    path: "/private/tmp/clocked-paid-web-pay-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Presets", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/private/tmp/clocked-paid-web-pay-mobile.png",
  });
});

test("deductions can be edited, disabled, deleted and example defaults require confirmation", async ({
  page,
}) => {
  await seed(page, { isPremium: true, history: [shift()] });
  await showPay(page);
  await custom(page);
  await page
    .getByRole("button", { name: "Add Common Tax Defaults", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".deduction-grid > article")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add Common Tax Defaults", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Add examples", exact: true })
    .click();
  await expect(page.locator(".deduction-grid > article")).toHaveCount(4);
  const federal = page
    .locator(".deduction-grid > article")
    .filter({ hasText: "Federal Tax" });
  await federal
    .getByRole("switch", { name: "Enable Federal Tax", exact: true })
    .click();
  await expect(federal.getByRole("switch")).not.toBeChecked();
  await federal
    .getByRole("button", { name: "Edit deduction", exact: true })
    .click();
  await dialog.getByLabel("Name", { exact: true }).fill("Personal tax");
  await dialog
    .getByRole("button", { name: "Save deduction", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const updated = page
    .locator(".deduction-grid > article")
    .filter({ hasText: "Personal tax" });
  await updated
    .getByRole("button", { name: "Delete deduction", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete deduction", exact: true })
    .click();
  await expect(updated).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".deduction-grid > article")).toHaveCount(3);
});

test("monthly schedule anchors, custom windows and invalid dates remain explicit", async ({
  page,
}) => {
  await seed(page, { isPremium: true });
  await page
    .getByRole("button", { name: "Set up pay schedule", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Pay frequency", exact: true })
    .selectOption("monthly");
  await dialog.getByLabel("Period start", { exact: true }).fill("2026-01-31");
  await expect(dialog.getByLabel("Period end", { exact: true })).toHaveValue(
    "2026-02-27",
  );
  await dialog.getByLabel("Pay date", { exact: true }).fill("2026-02-01");
  await dialog
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("Pay date", { exact: true }).fill("2026-03-06");
  await dialog
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".pay-range")).toContainText(
    "2026-01-31 → 2026-02-27",
  );
  await page
    .getByRole("button", { name: "Next period →", exact: true })
    .click();
  await expect(page.locator(".pay-range")).toContainText(
    "2026-02-28 → 2026-03-30",
  );
  await page
    .getByRole("button", { name: "← Previous period", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit pay schedule", exact: true })
    .click();
  await dialog.getByLabel("Period end", { exact: true }).fill("2026-02-20");
  await dialog
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Next period →", exact: true })
    .click();
  await expect(page.locator(".pay-range")).toContainText(
    "2026-02-21 → 2026-03-13",
  );
});
