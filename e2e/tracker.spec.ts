import { test, expect } from "./helpers/guest";

test("manual times persist and clock-out keeps saved work in Today's Summary", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tracker");
  await page.getByLabel("Clock in", { exact: true }).fill("09:00");
  await page.getByLabel("Lunch start", { exact: true }).fill("12:00");
  await page.getByLabel("Lunch end", { exact: true }).fill("12:30");
  await page.getByLabel("Clock out", { exact: true }).fill("17:00");
  await page
    .getByRole("button", { name: "Save completed shift", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Completed Today (1)", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Clock in", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Show pay", exact: true }).click();
  await expect(page.locator(".summary-amount")).toHaveText("$180.00");
  await page.reload();
  await page.getByRole("button", { name: "Show pay", exact: true }).click();
  await expect(page.locator(".summary-amount")).toHaveText("$180.00");
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Clock out", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clock out", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Completed Today (2)", exact: true }),
  ).toBeVisible();
  expect(
    Number(
      (await page.locator(".summary-amount").innerText()).replace(
        /[^\d.]/g,
        "",
      ),
    ),
  ).toBeGreaterThanOrEqual(180);
  await page
    .getByRole("tab", { name: "Completed Today (2)", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit times" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect(errors).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/private/tmp/clocked-paid-web-desktop.png",
    fullPage: true,
  });
});

test("Premium calculator separates input modes and retains drafts across tabs", async ({
  page,
}) => {
  await page.goto("/tracker");
  await page.getByRole("link", { name: "See plans" }).click();
  await page
    .getByRole("button", {
      name: "Start Premium preview (no charge)",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Show pay", exact: true }).click();
  await page
    .getByRole("tab", { name: "Hours Calculator", exact: true })
    .click();
  await page.getByLabel("Start time", { exact: true }).fill("09:00");
  await page.getByLabel("End time", { exact: true }).fill("17:00");
  await expect(page.locator("#panel-calculator")).toContainText("$180.00");
  await page.getByLabel("Start time", { exact: true }).fill("10:00");
  await expect(page.locator("#panel-calculator")).toContainText("$156.00");
  await page.getByRole("tab", { name: "Today's Plan", exact: true }).click();
  await page
    .getByRole("tab", { name: "Hours Calculator", exact: true })
    .click();
  await expect(page.getByLabel("Start time", { exact: true })).toHaveValue(
    "10:00",
  );
  await page.getByRole("button", { name: "6h", exact: true }).click();
  await expect(page.getByLabel("Start time", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("End time", { exact: true })).toHaveValue("");
  await expect(page.locator("#panel-calculator")).toContainText("$144.00");
});

test("Tracker fits narrow screens and exposes one section at a time", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tracker");
  await page.getByRole("tab", { name: "Today's Plan", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Today's Plan", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Clock in", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "12h", exact: true }).click();
  await expect(page.getByLabel("Custom work hours")).toHaveValue("12");
  await expect(
    page.getByRole("button", { name: "12h", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/private/tmp/clocked-paid-web-mobile.png",
    fullPage: true,
  });
});

test("unreadable browser workspace is preserved and shown as a load error", async ({
  page,
}) => {
  await page.goto("/tracker");
  await expect(
    page.getByRole("button", { name: "Clock in", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open("clocked-paid-web", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction("workspace", "readwrite");
    transaction
      .objectStore("workspace")
      .put({ version: 99, revision: 1, state: null }, "current");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Workspace unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
});

test("concurrent manual saves in two browser tabs retain both entries", async ({
  page,
  context,
}) => {
  await page.goto("/tracker");
  const other = await context.newPage();
  await other.goto("/tracker");
  await page.getByLabel("Clock in", { exact: true }).fill("09:00");
  await page.getByLabel("Clock out", { exact: true }).fill("10:00");
  await other.getByLabel("Clock in", { exact: true }).fill("11:00");
  await other.getByLabel("Clock out", { exact: true }).fill("12:00");
  await Promise.all([
    page
      .getByRole("button", { name: "Save completed shift", exact: true })
      .evaluate((button: HTMLButtonElement) => button.click()),
    other
      .getByRole("button", { name: "Save completed shift", exact: true })
      .evaluate((button: HTMLButtonElement) => button.click()),
  ]);
  await expect(
    page.getByRole("tab", { name: "Completed Today (2)", exact: true }),
  ).toBeVisible();
  await expect(
    other.getByRole("tab", { name: "Completed Today (2)", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Completed Today (2)", exact: true }),
  ).toBeVisible();
});

test("failed browser writes keep clock state unchanged and expose retry feedback", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/tracker");
  await expect(
    page.getByRole("button", { name: "Clock in", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Storage is full", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  await expect(page.locator(".toast")).toContainText(
    /Storage is full|Could not save/,
  );
  await expect(
    page.getByRole("button", { name: "Clock in", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Clock out", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
