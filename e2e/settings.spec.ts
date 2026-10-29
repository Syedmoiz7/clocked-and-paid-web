import { test, expect, type Page } from "./helpers/guest";
import { readFile } from "node:fs/promises";
import type { AppState, Shift } from "../src/types";
import { savedState, savedValue, seedState } from "./helpers/workspace";
test.use({ timezoneId: "Asia/Karachi" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00+05:00"));
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
});
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name, exact: true });
async function app(page: Page) {
  await page.getByRole("tab", { name: "App", exact: true }).click();
}
async function premium(page: Page) {
  await page.getByRole("button", { name: "Manage plan", exact: true }).click();
  await page
    .getByRole("button", { name: "Start Premium preview (no charge)" })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await app(page);
}
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
const backup = (data: AppState, changes: Record<string, unknown> = {}) => ({
  format: "clocked-and-paid-mobile",
  version: 1,
  history: data.history,
  jobs: data.jobs,
  deductions: data.deductions,
  paychecks: data.paychecks,
  paySchedules: data.paySchedules,
  settings: {
    preferences: data.preferences,
    plan: data.defaultPlan,
    breakIncluded: data.breakIncludedInRemaining,
  },
  ...changes,
});
async function upload(page: Page, payload: unknown, name = "backup.json") {
  await page.getByLabel("Backup file", { exact: true }).setInputFiles({
    name,
    mimeType: name.endsWith("csv") ? "text/csv" : "application/json",
    buffer: Buffer.from(
      typeof payload === "string" ? payload : JSON.stringify(payload),
    ),
  });
}
async function restore(page: Page) {
  await page
    .getByRole("dialog", { name: "Review import", exact: true })
    .getByRole("button", { name: "Restore backup", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function configure(page: Page, value = "0123") {
  await page.getByLabel("New PIN / password", { exact: true }).fill(value);
  await page.getByLabel("Confirm new credential", { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Enable privacy lock", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Lock now", exact: true }),
  ).toBeVisible();
}
async function unlock(page: Page, value = "0123") {
  await page.getByLabel("PIN / password", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Workspace locked", exact: true }),
  ).not.toBeVisible();
}

test("App drafts survive Account tab switches and saved preferences affect Tracker", async ({
  page,
}) => {
  await app(page);
  await page
    .getByLabel("Typical work hours (up to 24)", { exact: true })
    .fill("0");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(page.locator(".settings-feedback[role=alert]")).toContainText(
    "greater than 0",
  );
  await page
    .getByLabel("Typical work hours (up to 24)", { exact: true })
    .fill("10");
  await page
    .getByLabel("Default lunch duration (min)", { exact: true })
    .fill("45");
  await page
    .getByLabel("Typical start time (reference only)", { exact: true })
    .fill("22:00");
  await expect(
    page.getByText("10:00 PM → 8:45 AM (+1 day)", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("switch", { name: "Manual Time Editing", exact: true })
    .click();
  await page
    .getByRole("switch", { name: "Daily Motivational Quote", exact: true })
    .click();
  await page
    .getByRole("switch", { name: "Hide pay by default", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Clock Format", exact: true })
    .selectOption("24h");
  await page.getByRole("tab", { name: "Account", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Unsaved preferences", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Unsaved preferences", exact: true }),
  ).toHaveCount(0);
  await nav(page, "Tracker").click();
  await expect(
    page.getByRole("tab", { name: "Manual Times", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Next quote", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Hide pay", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Today's Plan", exact: true }).click();
  await expect(
    page.getByLabel("Custom work hours", { exact: true }),
  ).toHaveValue("10");
  await expect(
    page.getByLabel("Lunch duration (minutes)", { exact: true }),
  ).toHaveValue("45");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Hide pay", exact: true }),
  ).toBeVisible();
});

test("draft rebasing keeps another tab's untouched defaults and local changes", async ({
  page,
  context,
}) => {
  await app(page);
  await page
    .getByRole("switch", { name: "Daily Motivational Quote", exact: true })
    .click();
  const other = await context.newPage();
  await other.goto("/settings");
  await app(other);
  await other
    .getByLabel("Typical work hours (up to 24)", { exact: true })
    .fill("6");
  await other
    .getByRole("button", { name: "Save Changes", exact: true })
    .click();
  await expect(
    page.getByLabel("Typical work hours (up to 24)", { exact: true }),
  ).toHaveValue("6");
  await expect(
    page.getByRole("switch", { name: "Daily Motivational Quote", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Unsaved preferences", exact: true }),
  ).toHaveCount(0);
  const saved = await savedState(page);
  expect(saved.defaultPlan.plannedHours).toBe(6);
  expect(saved.preferences.showDailyQuote).toBe(false);
  await other.close();
});

test("saving defaults preserves a running plan while timer direction changes explicitly", async ({
  page,
}) => {
  await nav(page, "Tracker").click();
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  const before = await savedState(page);
  await nav(page, "Settings").click();
  await app(page);
  await page
    .getByLabel("Typical work hours (up to 24)", { exact: true })
    .fill("12");
  await page
    .getByRole("combobox", { name: "Shift Timer Direction", exact: true })
    .selectOption("count-down");
  await page
    .getByRole("combobox", { name: "Browser Tab Time", exact: true })
    .selectOption("off");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Unsaved preferences", exact: true }),
  ).toHaveCount(0);
  const after = await savedState(page);
  expect(after.defaultPlan.plannedHours).toBe(12);
  expect(after.todayPlan.plannedHours).toBe(before.todayPlan.plannedHours);
  expect(after.activeShift?.id).toBe(before.activeShift?.id);
  expect(after.todayPlan.timerDirection).toBe("count-down");
  await nav(page, "Tracker").click();
  await expect.poll(() => page.title()).toBe("Clocked & Paid");
});

test("theme saves independently from dirty preferences and Premium returns to Settings", async ({
  page,
}) => {
  await app(page);
  await page
    .getByRole("button", { name: "Blue, Premium", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start Premium preview (no charge)" })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await app(page);
  await page
    .getByRole("switch", { name: "Daily Motivational Quote", exact: true })
    .click();
  await page.getByRole("button", { name: "Blue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Blue", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", { name: "Unsaved preferences", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "Daily Motivational Quote", exact: true }),
  ).toBeChecked();
  expect((await savedState(page)).preferences.themeHue).toBe(220);
  await nav(page, "Jobs").click();
  await expect(
    page.getByRole("heading", { name: "Jobs", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-theme")).toHaveAttribute(
    "style",
    /--brand-h:\s*220/,
  );
  expect(
    await page
      .locator(".workspace-theme")
      .evaluate((node) =>
        getComputedStyle(node).getPropertyValue("--brand-h").trim(),
      ),
  ).toBe("220");
});

test("mock account name/email updates keep separate drafts and password feedback is local", async ({
  page,
}) => {
  await page
    .getByRole("link", { name: "Sign in with mock data", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("demo@example.test");
  await page.getByLabel("Password", { exact: true }).fill("anything");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Skip for now — go straight to the app",
      exact: true,
    })
    .click();
  await nav(page, "Settings").click();
  const dialog = page.getByRole("dialog");
  await page.getByLabel("Display name", { exact: true }).fill("Saleem");
  await page.getByLabel("Email address", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Update name", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "invalid",
  );
  await page.getByRole("button", { name: "Update email", exact: true }).click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Account", exact: true })
      .getByRole("status")
      .filter({ hasText: "Enter a valid email address." }),
  ).toBeVisible();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("saleem@example.test");
  await page.getByRole("button", { name: "Update email", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Update email", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("New mock password", { exact: true }).fill("short");
  await page.getByLabel("Confirm mock password", { exact: true }).fill("short");
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Account", exact: true })
      .getByRole("status")
      .filter({ hasText: "Password must be at least 6 characters." }),
  ).toBeVisible();
  await page
    .getByLabel("New mock password", { exact: true })
    .fill("local-password-123");
  await page
    .getByLabel("Confirm mock password", { exact: true })
    .fill("local-password-123");
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(
    page.getByLabel("New mock password", { exact: true }),
  ).toHaveValue("");
  expect(JSON.stringify(await savedState(page))).not.toContain(
    "local-password-123",
  );
  await page
    .getByRole("button", { name: "Sign out of mock account", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continue as Guest", exact: true }),
  ).toBeVisible();
});

test("JSON and CSV downloads exclude credentials/account/entitlements and preserve business data", async ({
  page,
}) => {
  await seedState(page, {
    isPremium: true,
    history: [shift()],
    account: {
      mode: "mock",
      name: "Private Name",
      email: "private@example.test",
    },
  });
  await app(page);
  const jsonDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export JSON backup", exact: true })
    .click();
  const file = await jsonDownload,
    text = await readFile((await file.path())!, "utf8"),
    value = JSON.parse(text);
  expect(value.history).toHaveLength(1);
  expect(value.jobs).toHaveLength(1);
  expect(value.account).toBeUndefined();
  expect(value.auth).toBeUndefined();
  expect(value.isPremium).toBeUndefined();
  expect(text).not.toContain("private@example.test");
  const csvDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export history CSV", exact: true })
    .click();
  const csv = await csvDownload;
  expect(await readFile((await csv.path())!, "utf8")).toContain("2026-10-28");
});

test("import preview merges idempotently and blocks preferences while App drafts are dirty", async ({
  page,
}) => {
  await premium(page);
  const data = await savedState(page),
    payload = backup(data, { history: [shift()] });
  await page
    .getByRole("switch", { name: "Daily Motivational Quote", exact: true })
    .click();
  await upload(page, payload);
  const dialog = page.getByRole("dialog", {
    name: "Review import",
    exact: true,
  });
  await expect(dialog).toContainText("1 new IDs");
  await expect(
    dialog.getByRole("switch", {
      name: "Restore backup preferences",
      exact: true,
    }),
  ).toBeDisabled();
  await restore(page);
  expect((await savedState(page)).history).toHaveLength(1);
  await upload(page, payload);
  await expect(dialog).toContainText("1 matching IDs kept");
  await restore(page);
  expect((await savedState(page)).history).toHaveLength(1);
  await expect(
    page.getByRole("region", { name: "Unsaved preferences", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
});

test("replacing history retains recovery IDs and missing-only recovery preserves matching edits", async ({
  page,
}) => {
  await premium(page);
  const data = await savedState(page);
  await upload(page, backup(data, { history: [shift({ id: "old" })] }));
  await restore(page);
  await upload(page, { history: [shift({ id: "new", customRate: 50 })] });
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Import mode", exact: true })
    .selectOption("replace");
  await restore(page);
  expect((await savedState(page)).history.map((entry) => entry.id)).toEqual([
    "new",
  ]);
  await page
    .getByRole("button", { name: "Scan browser recovery", exact: true })
    .click();
  await expect(page.getByText(/1 missing entry/)).toBeVisible();
  await page
    .getByRole("button", { name: "Recover missing history", exact: true })
    .click();
  await expect(page.getByText(/0 missing entries/)).toBeVisible();
  const recovered = await savedState(page);
  expect(recovered.history.map((entry) => entry.id).sort()).toEqual([
    "new",
    "old",
  ]);
  expect(
    recovered.history.find((entry) => entry.id === "new")?.customRate,
  ).toBe(50);
});

test("foreign-currency imports retain source prices without changing current preferences", async ({
  page,
}) => {
  await premium(page);
  const data = await savedState(page),
    foreign = {
      ...data.jobs[0]!,
      id: "foreign",
      name: "Euro work",
      currency: "EUR",
      hourlyRate: 40,
      isDefault: false,
    };
  const payload = backup(data, {
    history: [shift({ id: "eur", jobId: "foreign" })],
    jobs: [foreign],
    settings: {
      preferences: { ...data.preferences, currency: "EUR" },
      plan: { ...data.defaultPlan, hourlyRate: 100 },
      breakIncluded: false,
    },
  });
  await upload(page, payload);
  await restore(page);
  const saved = await savedState(page);
  expect(saved.preferences.currency).toBe("USD");
  expect(saved.history[0]?.currency).toBe("EUR");
  expect(saved.history[0]?.customRate).toBe(40);
  await nav(page, "History").click();
  await page.getByRole("button", { name: "Show pay", exact: true }).click();
  await expect(page.locator(".history-entry")).toContainText("€320.00");
});

test("active sessions block replace and merge never inserts a running ID as saved history", async ({
  page,
}) => {
  await premium(page);
  await nav(page, "Tracker").click();
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  const data = await savedState(page);
  await nav(page, "Settings").click();
  await app(page);
  await upload(page, backup(data, { history: [data.activeShift, shift()] }));
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("option", {
      name: "Replace included collections",
      exact: true,
    }),
  ).toHaveAttribute("disabled", "");
  await restore(page);
  const saved = await savedState(page);
  expect(saved.activeShift?.id).toBe(data.activeShift?.id);
  expect(saved.history.some((entry) => entry.id === data.activeShift?.id)).toBe(
    false,
  );
  expect(saved.history).toHaveLength(1);
});

test("workspace and recovery writes roll back together on storage failure; draft stays editable", async ({
  page,
}) => {
  await app(page);
  const before = await savedValue(page),
    recovery = await savedValue(page, "recovery");
  await page
    .getByRole("switch", { name: "Daily Motivational Quote", exact: true })
    .click();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === "current")
        throw new DOMException("Quota reached", "QuotaExceededError");
      return put.call(this, value, key!);
    };
  });
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(page.locator(".settings-feedback[role=alert]")).toContainText(
    "not saved",
  );
  expect(await savedValue(page)).toEqual(before);
  expect(await savedValue(page, "recovery")).toEqual(recovery);
  await expect(
    page.getByRole("switch", { name: "Daily Motivational Quote", exact: true }),
  ).not.toBeChecked();
});

test("PIN privacy gate persists, validates attempts and retains open drafts when backgrounded", async ({
  page,
}) => {
  await app(page);
  await configure(page);
  await nav(page, "Jobs").click();
  await page
    .getByRole("button", { name: "Edit Default job", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit job", exact: true });
  await dialog
    .getByLabel("Company / job name", { exact: true })
    .fill("Unsaved private draft");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("heading", { name: "Workspace locked", exact: true }),
  ).toBeVisible();
  await expect(dialog).not.toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.getByLabel("PIN / password", { exact: true }).fill("9999");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.locator(".privacy-gate p[role=alert]")).toContainText(
    "Incorrect",
  );
  await unlock(page);
  await expect(
    dialog.getByLabel("Company / job name", { exact: true }),
  ).toHaveValue("Unsaved private draft");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Workspace locked", exact: true }),
  ).toBeVisible();
  await unlock(page);
  await nav(page, "Settings").click();
  await app(page);
  await page.getByLabel("Current PIN / password", { exact: true }).fill("0123");
  await page
    .getByRole("button", { name: "Remove privacy lock", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable privacy lock", exact: true }),
  ).toBeVisible();
});

test("privacy cooldown persists and password changes require the current credential", async ({
  page,
}) => {
  await app(page);
  await configure(page);
  await page.getByRole("button", { name: "Lock now", exact: true }).click();
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.getByLabel("PIN / password", { exact: true }).fill("9999");
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Unlock", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".privacy-gate p[role=alert]")).toContainText(
      "Incorrect",
    );
  }
  await page.getByLabel("PIN / password", { exact: true }).fill("0123");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.locator(".privacy-gate p[role=alert]")).toContainText(
    "Too many attempts",
  );
  await page.clock.setFixedTime(new Date("2026-10-28T12:01:00+05:00"));
  await unlock(page);
  await page
    .getByRole("combobox", { name: "Lock type", exact: true })
    .selectOption("password");
  await page
    .getByLabel("Current PIN / password", { exact: true })
    .fill("wrong");
  await page
    .getByLabel("New PIN / password", { exact: true })
    .fill("private-local-password");
  await page
    .getByLabel("Confirm new credential", { exact: true })
    .fill("private-local-password");
  await page
    .getByRole("button", { name: "Change privacy lock", exact: true })
    .click();
  await expect(
    page.getByText("Incorrect PIN or password.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Current PIN / password", { exact: true }).fill("0123");
  await page
    .getByRole("button", { name: "Change privacy lock", exact: true })
    .click();
  await expect(
    page.getByLabel("New PIN / password", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Lock now", exact: true }).click();
  await unlock(page, "private-local-password");
});

test("reset needs typed and final confirmation, clears recovery, and retains privacy/account mode", async ({
  page,
}) => {
  await seedState(page, {
    isPremium: true,
    history: [shift()],
    account: { mode: "mock", name: "Keep name", email: "keep@example.test" },
  });
  await app(page);
  await configure(page);
  await page
    .getByRole("button", { name: "Reset local data…", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Reset local data",
    exact: true,
  });
  await dialog
    .getByRole("button", {
      name: "Continue to final confirmation",
      exact: true,
    })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Type RESET");
  await dialog
    .getByLabel("Type RESET to continue", { exact: true })
    .fill("RESET");
  await dialog
    .getByRole("button", {
      name: "Continue to final confirmation",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog", {
      name: "Permanently reset this workspace?",
      exact: true,
    })
    .getByRole("button", { name: "Reset workspace", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const data = await savedState(page);
  expect(data.history).toHaveLength(0);
  expect(data.jobs).toHaveLength(0);
  expect(data.account.name).toBe("Keep name");
  expect(data.isPremium).toBe(true);
  expect(await savedValue(page, "recovery")).toBeUndefined();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Workspace locked", exact: true }),
  ).toBeVisible();
  await unlock(page);
});

test("emergency recovery preserves unreadable raw data and restores validated business records", async ({
  page,
}) => {
  await premium(page);
  const data = await savedState(page);
  await upload(page, backup(data, { history: [shift()] }));
  await restore(page);
  await page.evaluate(async () => {
    const request = indexedDB.open("clocked-paid-web", 1),
      db = await new Promise<IDBDatabase>((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
    const tx = db.transaction("workspace", "readwrite");
    tx.objectStore("workspace").put(
      { version: 1, revision: 100, state: { history: "unreadable" } },
      "current",
    );
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Workspace unavailable", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review emergency recovery", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore recovery copy", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Continue as Guest", exact: true }),
  ).toBeVisible();
  expect((await savedState(page)).history).toHaveLength(1);
  expect((await savedState(page)).isPremium).toBe(false);
  expect(await savedValue(page, "unreadable-copy")).toMatchObject({
    state: { history: "unreadable" },
  });
});

test("malformed backup input never mutates saved records and Settings fits a narrow viewport", async ({
  page,
}) => {
  await premium(page);
  const before = await savedState(page);
  await upload(page, "{broken");
  await expect(page.locator("p[role=alert]")).toContainText("Invalid JSON");
  expect(await savedState(page)).toEqual(before);
  await page
    .getByLabel("Typical work hours (up to 24)", { exact: true })
    .fill("9");
  await page.screenshot({
    path: "/private/tmp/clocked-paid-web-settings-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page
    .getByRole("region", { name: "Unsaved preferences", exact: true })
    .scrollIntoViewIfNeeded();
  const button = await page
    .getByRole("button", { name: "Save Changes", exact: true })
    .boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(844);
  await page.screenshot({
    path: "/private/tmp/clocked-paid-web-settings-mobile.png",
  });
});

test("browser title timer works across routes and exposes time over plan", async ({
  page,
}) => {
  await app(page);
  await page
    .getByRole("combobox", { name: "Default lunch reminder", exact: true })
    .selectOption("off");
  await page
    .getByRole("switch", { name: "Return-to-Work Reminder", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Browser Tab Time", exact: true })
    .selectOption("count-down");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Unsaved preferences", exact: true }),
  ).toHaveCount(0);
  await nav(page, "Tracker").click();
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  await nav(page, "Pay").click();
  await expect.poll(() => page.title()).toBe("08:30:00 · Clocked & Paid");
  await page.clock.setFixedTime(new Date("2026-10-28T21:00:00+05:00"));
  await expect
    .poll(() => page.title())
    .toBe("+00:30:00 over plan · Clocked & Paid");
  await nav(page, "Jobs").click();
  await expect
    .poll(() => page.title())
    .toBe("+00:30:00 over plan · Clocked & Paid");
});

test("privacy changes lock other tabs but keep the configuring page open", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto("/jobs");
  await expect(
    other.getByRole("heading", { name: "Jobs", exact: true }),
  ).toBeVisible();
  await app(page);
  await configure(page);
  await expect(
    page.getByRole("heading", { name: "Workspace locked", exact: true }),
  ).toHaveCount(0);
  await expect(
    other.getByRole("heading", { name: "Workspace locked", exact: true }),
  ).toBeVisible();
  await unlock(other);
  await page.getByRole("button", { name: "Lock now", exact: true }).click();
  await expect(
    other.getByRole("heading", { name: "Workspace locked", exact: true }),
  ).toBeVisible();
  await other.close();
});

test("backgrounding during an unlock invalidates that pending attempt", async ({
  page,
}) => {
  await app(page);
  await configure(page);
  await page.getByRole("button", { name: "Lock now", exact: true }).click();
  await page.evaluate(() => {
    const derive = crypto.subtle.deriveBits.bind(crypto.subtle);
    crypto.subtle.deriveBits = ((
      ...args: Parameters<SubtleCrypto["deriveBits"]>
    ) =>
      new Promise<ArrayBuffer>((resolve, reject) =>
        setTimeout(() => void derive(...args).then(resolve, reject), 300),
      )) as SubtleCrypto["deriveBits"];
  });
  await page.getByLabel("PIN / password", { exact: true }).fill("0123");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".privacy-gate p[role=alert]")).toContainText(
    "page was hidden",
  );
  await expect(
    page.getByRole("heading", { name: "Workspace locked", exact: true }),
  ).toBeVisible();
  await unlock(page);
});

test("unreadable privacy configuration fails closed without changing the workspace", async ({
  page,
}) => {
  const before = await savedValue(page);
  await page.evaluate(async () => {
    const request = indexedDB.open("clocked-paid-web-private", 1),
      db = await new Promise<IDBDatabase>((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
    const tx = db.transaction("credentials", "readwrite");
    tx.objectStore("credentials").put({ version: 1, hash: "bad" }, "privacy");
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator("p[role=alert]")).toContainText(
    "Privacy configuration could not be loaded",
  );
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toHaveCount(0);
  expect(await savedValue(page)).toEqual(before);
});

test("default reminder drafts and clock labels follow saved App preferences", async ({
  page,
}) => {
  await app(page);
  await page
    .getByRole("button", { name: "+ Add reminder", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Reminder draft",
    exact: true,
  });
  await dialog
    .getByLabel("Reminder name", { exact: true })
    .fill("Afternoon reminder");
  await dialog
    .getByRole("combobox", { name: "When to fire", exact: true })
    .selectOption("at-time");
  await dialog.getByLabel("Reminder time", { exact: true }).fill("13:00");
  await dialog
    .getByRole("button", {
      name: "Use reminder in defaults draft",
      exact: true,
    })
    .click();
  await expect(page.locator(".job-reminder")).toContainText("At 1:00 PM");
  await page
    .getByRole("combobox", { name: "Clock Format", exact: true })
    .selectOption("24h");
  await expect(page.locator(".job-reminder")).toContainText("At 13:00");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Unsaved preferences", exact: true }),
  ).toHaveCount(0);
  expect(
    (await savedState(page)).preferences.defaultReminders.custom[0]?.atTime,
  ).toBe("13:00");
});

test("failed reset rolls back both business data and its recovery snapshot", async ({
  page,
}) => {
  await premium(page);
  const data = await savedState(page);
  await upload(page, backup(data, { history: [shift()] }));
  await restore(page);
  const before = await savedValue(page),
    recovery = await savedValue(page, "recovery");
  await page
    .getByRole("button", { name: "Reset local data…", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Reset local data",
    exact: true,
  });
  await dialog
    .getByLabel("Type RESET to continue", { exact: true })
    .fill("RESET");
  await dialog
    .getByRole("button", {
      name: "Continue to final confirmation",
      exact: true,
    })
    .click();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === "current")
        throw new DOMException("Quota reached", "QuotaExceededError");
      return put.call(this, value, key!);
    };
  });
  const final = page.getByRole("dialog", {
    name: "Permanently reset this workspace?",
    exact: true,
  });
  await final
    .getByRole("button", { name: "Reset workspace", exact: true })
    .click();
  await expect(final.getByRole("alert")).toContainText("not saved");
  expect(await savedValue(page)).toEqual(before);
  expect(await savedValue(page, "recovery")).toEqual(recovery);
});
