import { test, expect, type Page } from "@playwright/test";
import type { AppState, MockJob, Shift } from "../src/types";

test.use({ timezoneId: "Asia/Karachi" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00+05:00"));
  await page.goto("/jobs");
  await expect(
    page.getByRole("heading", { name: "Jobs", exact: true }),
  ).toBeVisible();
});
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name, exact: true });
async function state(page: Page): Promise<AppState> {
  return page.evaluate(async () => {
    const request = indexedDB.open("clocked-paid-web", 1),
      db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const tx = db.transaction("workspace", "readonly"),
      read = tx.objectStore("workspace").get("current");
    const result = await new Promise<AppState>((resolve, reject) => {
      read.onsuccess = () => resolve(read.result.state);
      read.onerror = () => reject(read.error);
    });
    db.close();
    return result;
  });
}
async function seed(page: Page, changes: Partial<AppState>) {
  await page.evaluate(async (changes) => {
    const request = indexedDB.open("clocked-paid-web", 1),
      db = await new Promise<IDBDatabase>((resolve, reject) => {
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
    page.getByRole("heading", { name: "Jobs", exact: true }),
  ).toBeVisible();
}
async function premium(page: Page) {
  await page
    .getByRole("button", { name: "Add job · Premium", exact: true })
    .click();
  await expect(page).toHaveURL(/plans\?returnTo=jobs/);
  await page
    .getByRole("button", { name: "Start Premium preview (no charge)" })
    .click();
  await expect(page).toHaveURL(/\/jobs$/);
}
async function addJob(page: Page, name = "Studio", rate = "40") {
  await page.getByRole("button", { name: "Add job", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add job", exact: true });
  await dialog.getByLabel("Company / job name", { exact: true }).fill(name);
  await dialog.getByLabel("Hourly rate", { exact: true }).fill(rate);
  return dialog;
}
const profile = (changes: Partial<MockJob> = {}): MockJob => ({
  id: "default",
  name: "Default job",
  hourlyRate: 24,
  color: "#d65c90",
  currency: "USD",
  isDefault: true,
  ...changes,
});
const shift = (changes: Partial<Shift> = {}): Shift => ({
  id: "saved",
  date: "2026-10-28",
  jobId: "default",
  startedAt: "2026-10-28T09:00:00+05:00",
  endedAt: "2026-10-28T17:00:00+05:00",
  lunchMinutes: 0,
  breakMinutes: 0,
  earnings: 192,
  ...changes,
});

test("Free edits its profile with validation, privacy and durable defaults", async ({
  page,
}) => {
  const card = page.getByRole("article", {
    name: "Default job profile",
    exact: true,
  });
  await expect(card).toContainText("Selected in Tracker");
  await expect(card).toContainText("•••••");
  await page.getByRole("button", { name: "Show pay", exact: true }).click();
  await expect(card).toContainText("$24.00");
  await card
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Company / job name", { exact: true }).fill("");
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("required");
  await dialog
    .getByLabel("Company / job name", { exact: true })
    .fill("Coffee shop");
  await dialog.getByLabel("Role / title", { exact: true }).fill("Barista");
  await dialog.getByLabel("Hourly rate", { exact: true }).fill("30");
  await dialog
    .getByLabel("Typical lunch break (min)", { exact: true })
    .fill("45");
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  const updated = page.getByRole("article", {
    name: "Coffee shop profile",
    exact: true,
  });
  await expect(updated).toContainText("Barista");
  await nav(page, "Tracker").click();
  await page.getByRole("tab", { name: "Today's Plan", exact: true }).click();
  await expect(page.getByLabel("Hourly rate", { exact: true })).toHaveValue(
    "30",
  );
  await expect(
    page.getByLabel("Lunch duration (minutes)", { exact: true }),
  ).toHaveValue("45");
});

test("Premium adds profiles; selection and default remain distinct and downgrade retains them", async ({
  page,
}) => {
  await premium(page);
  const dialog = await addJob(page);
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const studio = page.getByRole("article", {
      name: "Studio profile",
      exact: true,
    }),
    original = page.getByRole("article", {
      name: "Default job profile",
      exact: true,
    });
  await studio
    .getByRole("button", { name: "Use for Tracker", exact: true })
    .click();
  await expect(studio).toContainText("Selected in Tracker");
  await expect(original.locator(".job-badges")).toContainText("Default");
  await expect(studio.locator(".job-badges")).not.toContainText("Default");
  await original
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  const originalEditor = page.getByRole("dialog", {
    name: "Edit job",
    exact: true,
  });
  await originalEditor
    .getByLabel("Notes", { exact: true })
    .fill("Default profile notes only");
  await originalEditor
    .getByRole("button", { name: "Save job", exact: true })
    .click();
  await expect(originalEditor).not.toBeVisible();
  await expect(studio).toContainText("Selected in Tracker");
  await studio
    .getByRole("button", { name: "Make default & select", exact: true })
    .click();
  await expect(studio.locator(".job-badges")).toContainText("Default");
  await page
    .getByRole("link", { name: "Premium preview", exact: true })
    .click();
  await page.getByRole("button", { name: "Use Free", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.locator(".job-card")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Add job · Premium", exact: true }),
  ).toBeVisible();
});

test("rate edits preserve historical gross and referenced jobs archive without losing work", async ({
  page,
}) => {
  await seed(page, { isPremium: true, history: [shift()] });
  await page.getByRole("button", { name: "Show pay", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Currency", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Hourly rate", { exact: true }).fill("100");
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await nav(page, "History").click();
  await expect(page.locator(".history-entry")).toContainText("$192.00");
  await nav(page, "Jobs").click();
  await page
    .getByRole("button", { name: "Delete Default job", exact: true })
    .click();
  await expect(dialog).toContainText("retained for historical calculations");
  await dialog.getByRole("button", { name: "Delete job", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".job-card")).toHaveCount(0);
  const saved = await state(page);
  expect(saved.jobs[0]?.archived).toBe(true);
  expect(saved.history[0]?.customRate).toBe(24);
  await nav(page, "History").click();
  await page.getByRole("button", { name: "Show pay", exact: true }).click();
  await expect(page.locator(".history-entry")).toContainText("$192.00");
});

test("deleting the last unused job persists an empty workspace and a new first job becomes default", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Delete Default job", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete job", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Add your first job", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".job-card")).toHaveCount(0);
  const dialog = await addJob(page, "New start", "25");
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  const card = page.getByRole("article", {
    name: "New start profile",
    exact: true,
  });
  await expect(card).toContainText("Default");
  await expect(card).toContainText("Selected in Tracker");
});

test("schedule anchors and pay delay update Pay, with explicit change confirmation and scoped cache invalidation", async ({
  page,
}) => {
  await premium(page);
  await page
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Pay frequency", exact: true })
    .selectOption("monthly");
  await dialog
    .getByLabel("Anchor period start", { exact: true })
    .fill("2026-01-31");
  await dialog
    .getByLabel("Pay delay after period end (days)", { exact: true })
    .fill("3");
  await expect(dialog).toContainText("2026-02-27");
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const snapshot = await state(page),
    schedule = {
      frequency: "weekly" as const,
      periodStart: "2026-10-26",
      periodEnd: "2026-11-01",
      payDate: "2026-11-04",
      payDelayDays: 3,
    };
  await seed(page, { paySchedules: { default: schedule, __fs__: schedule } });
  await page
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  await dialog
    .getByLabel("Pay delay after period end (days)", { exact: true })
    .fill("5");
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Confirm");
  await dialog
    .getByRole("switch", {
      name: "I confirm this pay schedule change",
      exact: true,
    })
    .click();
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const updated = await state(page);
  expect(updated.paySchedules.default).toBeUndefined();
  expect(updated.paySchedules.__fs__).toEqual(schedule);
  expect(updated.jobs[0]?.payDelayDays).toBe(5);
  expect(updated.jobs[0]?.payPeriodStart).toBe(
    snapshot.jobs[0]?.payPeriodStart,
  );
  await nav(page, "Pay").click();
  await page
    .getByRole("combobox", { name: "Pay job", exact: true })
    .selectOption("default");
  await expect(page.locator(".pay-range")).toContainText(
    "2026-09-30 → 2026-10-30",
  );
  await expect(page.locator(".pay-period-controls")).toContainText(
    "2026-11-04",
  );
});

test("running work locks pay/lunch/removal and selection while notes save without resetting the plan", async ({
  page,
}) => {
  const snapshot = await state(page);
  await seed(page, {
    isPremium: true,
    jobs: [
      profile(),
      profile({ id: "other", name: "Other job", isDefault: false }),
    ],
    activeShift: shift({
      id: "active",
      endedAt: null,
      startedAt: "2026-10-28T11:00:00+05:00",
    }),
    todayPlan: { ...snapshot.todayPlan, plannedHours: 6 },
    reminders: { ...snapshot.reminders, lunchReminder: false },
  });
  await expect(
    page.getByRole("button", { name: "Delete Default job", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Use for Tracker", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("Hourly rate", { exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByLabel("Typical lunch break (min)", { exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Notes", { exact: true }).fill("Notes during shift");
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect((await state(page)).todayPlan.plannedHours).toBe(6);
  await nav(page, "Tracker").click();
  await expect(
    page.getByRole("button", { name: "Clock out", exact: true }),
  ).toBeVisible();
});

test("Jobs deduction scope is locked and changes share the Pay records", async ({
  page,
}) => {
  await premium(page);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Add job deduction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Deduction job", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Name", { exact: true }).fill("Insurance");
  await dialog.getByRole("button", { name: "Percentage", exact: true }).click();
  await dialog.getByLabel("Percentage (%)", { exact: true }).fill("10");
  await dialog
    .getByRole("button", { name: "Save deduction", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".job-deduction")).toContainText("Insurance");
  await nav(page, "Pay").click();
  await expect(page.locator(".pay-deductions")).toContainText("Insurance");
  await nav(page, "Jobs").click();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page
    .getByRole("switch", { name: "Enable Insurance", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Enable Insurance", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Delete Insurance", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Delete deduction", exact: true })
    .click();
  await expect(page.locator(".job-deduction")).toHaveCount(0);
});

test("reminder drafts require using and saving the parent job; cancelling discards them", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  let jobDialog = page.getByRole("dialog", { name: "Edit job", exact: true });
  await jobDialog
    .getByRole("button", { name: "+ Add reminder", exact: true })
    .click();
  const reminder = page.getByRole("dialog", {
    name: "Reminder draft",
    exact: true,
  });
  await reminder
    .getByRole("button", { name: "Use reminder in job draft", exact: true })
    .click();
  await expect(reminder.getByRole("alert")).toContainText("name is required");
  await reminder
    .getByLabel("Reminder name", { exact: true })
    .fill("Drink water");
  await reminder
    .getByLabel("Minutes after trigger (1–480)", { exact: true })
    .fill("1");
  await reminder
    .getByRole("button", { name: "Use reminder in job draft", exact: true })
    .click();
  await expect(reminder).not.toBeVisible();
  await expect(jobDialog).toContainText("Drink water");
  await jobDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await state(page)).jobs[0]?.reminderSettings?.custom ?? [],
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  jobDialog = page.getByRole("dialog", { name: "Edit job", exact: true });
  await expect(jobDialog.locator(".job-reminder")).toHaveCount(0);
  await jobDialog
    .getByRole("button", { name: "+ Add reminder", exact: true })
    .click();
  await reminder
    .getByLabel("Reminder name", { exact: true })
    .fill("Drink water");
  await reminder
    .getByRole("combobox", { name: "When to fire", exact: true })
    .selectOption("at-time");
  await reminder.getByLabel("Reminder time", { exact: true }).fill("13:00");
  await reminder
    .getByRole("button", { name: "Use reminder in job draft", exact: true })
    .click();
  await jobDialog
    .getByRole("button", { name: "Save job", exact: true })
    .click();
  await expect(jobDialog).not.toBeVisible();
  expect((await state(page)).jobs[0]?.reminderSettings?.custom[0]?.atTime).toBe(
    "13:00",
  );
  await page
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  await jobDialog
    .getByRole("button", { name: "Edit Drink water", exact: true })
    .click();
  await reminder.getByLabel("Reminder name", { exact: true }).fill("Stretch");
  await reminder
    .getByRole("switch", { name: "Repeat reminder", exact: true })
    .click();
  await reminder
    .getByLabel("Repeat interval (minutes)", { exact: true })
    .fill("5");
  await reminder
    .getByRole("button", { name: "Use reminder in job draft", exact: true })
    .click();
  await jobDialog
    .getByRole("button", { name: "Delete Stretch", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Delete reminder from draft?", exact: true })
    .getByRole("button", { name: "Delete reminder", exact: true })
    .click();
  await expect(jobDialog.locator(".job-reminder")).toHaveCount(0);
  await jobDialog
    .getByRole("button", { name: "Save job", exact: true })
    .click();
  await expect(jobDialog).not.toBeVisible();
  expect((await state(page)).jobs[0]?.reminderSettings?.custom).toHaveLength(0);
});

test("failed Jobs writes preserve the form and stale edits reject another tab's changes", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto("/jobs");
  await other
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Company / job name", { exact: true })
    .fill("Updated name");
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await other
    .getByRole("dialog")
    .getByLabel("Company / job name", { exact: true })
    .fill("Stale name");
  await other
    .getByRole("dialog")
    .getByRole("button", { name: "Save job", exact: true })
    .click();
  await expect(other.getByRole("dialog").getByRole("alert")).toContainText(
    "changed in another tab",
  );
  await other.close();
  await page
    .getByRole("button", { name: "Edit Updated name", exact: true })
    .click();
  await dialog
    .getByLabel("Company / job name", { exact: true })
    .fill("Keep this draft");
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Quota reached", "QuotaExceededError");
    };
  });
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("not saved");
  await expect(
    dialog.getByLabel("Company / job name", { exact: true }),
  ).toHaveValue("Keep this draft");
});

test("tips enabled in Jobs open the Tracker clock-out form and feed Pay", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("switch", { name: "Enable tips at clock-out", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await nav(page, "Tracker").click();
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  await page.clock.setFixedTime(new Date("2026-10-28T13:00:00+05:00"));
  await page.getByRole("button", { name: "Clock out", exact: true }).click();
  await dialog.getByLabel("Tips amount (optional)", { exact: true }).fill("10");
  await dialog
    .getByRole("combobox", { name: "Tip type", exact: true })
    .selectOption("paycheck");
  await dialog
    .getByRole("button", { name: "Save tips & clock out", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await nav(page, "Pay").click();
  await page.getByRole("button", { name: "Show pay", exact: true }).click();
  await expect(page.getByTestId("pay-summary")).toContainText("$34.00");
});

test("Jobs fits desktop and narrow screens with accessible editor controls", async ({
  page,
}) => {
  await premium(page);
  const dialog = await addJob(page, "Studio with a longer name", "45");
  await dialog.getByRole("button", { name: "Save job", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("article", {
      name: "Studio with a longer name profile",
      exact: true,
    })
    .getByRole("button", { name: "Details", exact: true })
    .click();
  await page.screenshot({
    path: "/private/tmp/clocked-paid-web-jobs-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/private/tmp/clocked-paid-web-jobs-mobile.png",
  });
  await page
    .getByRole("button", {
      name: "Edit Studio with a longer name",
      exact: true,
    })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit job", exact: true });
  await expect(editor.getByLabel("Hourly rate", { exact: true })).toHaveValue(
    "45",
  );
  await expect
    .poll(() => editor.evaluate((node) => node.scrollWidth <= node.clientWidth))
    .toBe(true);
  const bounds = await editor.boundingBox(),
    saveBounds = await editor
      .getByRole("button", { name: "Save job", exact: true })
      .boundingBox();
  expect(bounds).not.toBeNull();
  expect(saveBounds).not.toBeNull();
  expect(saveBounds!.y + saveBounds!.height).toBeLessThanOrEqual(
    bounds!.y + bounds!.height - 8,
  );
  await page.screenshot({
    path: "/private/tmp/clocked-paid-web-jobs-editor-mobile.png",
  });
});

test("concurrent job reminders honor priority, inline/overlay, snooze, silent delivery and persisted repeats", async ({
  page,
}) => {
  const snapshot = await state(page),
    defaults = snapshot.preferences.defaultReminders;
  const base = {
    ...defaults,
    lunchMode: "off" as const,
    returnReminder: false,
    sound: false,
    indicator: true,
    snoozeMinutes: 2,
  };
  const custom = (id: string, priority: "low" | "high", repeatMinutes = 0) => ({
    id,
    name: id,
    message: `Message for ${id}`,
    enabled: true,
    trigger: "after-clock-in" as const,
    offsetMinutes: 1,
    atTime: "12:00",
    repeatMinutes,
    priority,
  });
  await seed(page, {
    isPremium: true,
    jobs: [
      profile({
        reminderSettings: {
          ...base,
          overlay: false,
          custom: [custom("Primary low", "low")],
        },
      }),
      profile({
        id: "extra-job",
        name: "Evening job",
        isDefault: false,
        reminderSettings: {
          ...base,
          overlay: true,
          custom: [custom("Extra high", "high", 2)],
        },
      }),
    ],
    activeShift: shift({
      id: "primary",
      startedAt: "2026-10-28T12:00:00+05:00",
      endedAt: null,
    }),
    extraShifts: [
      shift({
        id: "extra",
        jobId: "extra-job",
        startedAt: "2026-10-28T12:00:00+05:00",
        endedAt: null,
      }),
    ],
    reminders: {
      ...snapshot.reminders,
      lunchReminder: false,
      returnReminder: false,
      reminderOverlay: false,
      reminderSound: false,
      reminderTabFlash: true,
      reminderSnoozeMinutes: 2,
    },
  });
  await page.evaluate(() => {
    const calls: { title: string; silent?: boolean }[] = [];
    Object.assign(window, { reminderNotifications: calls });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: class {
        static permission = "granted";
        constructor(title: string, options?: NotificationOptions) {
          calls.push({ title, silent: options?.silent ?? false });
        }
      },
    });
  });
  await page.clock.setFixedTime(new Date("2026-10-28T12:01:00+05:00"));
  const high = page.getByRole("dialog", { name: "Extra high", exact: true });
  await expect(high).toBeVisible();
  await high.getByRole("button", { name: "Snooze 2m", exact: true }).click();
  await expect(high).not.toBeVisible();
  await expect(page.locator(".reminder-alert")).toContainText("Primary low");
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(page.locator(".reminder-alert")).toHaveCount(0);
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          reminderNotifications: { title: string; silent: boolean }[];
        }
      ).reminderNotifications,
  );
  expect(calls.map((item) => item.title)).toEqual([
    "Extra high",
    "Primary low",
  ]);
  expect(calls.every((item) => item.silent)).toBe(true);
  await nav(page, "History").click();
  await page.clock.setFixedTime(new Date("2026-10-28T12:03:00+05:00"));
  await expect(high).toBeVisible();
  await expect.poll(() => page.title()).toContain("Reminder: Extra high");
  await high.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(high).not.toBeVisible();
  await page.reload();
  await page.clock.setFixedTime(new Date("2026-10-28T12:05:00+05:00"));
  await expect(high).toBeVisible();
});
