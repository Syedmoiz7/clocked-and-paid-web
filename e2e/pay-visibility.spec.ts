import { test, expect } from "./helpers/guest";
import { savedState, seedState } from "./helpers/workspace";

test("client-style Show Pay switch controls the shared setting across web modules", async ({
  page,
}, info) => {
  await seedState(page, {
    history: [
      {
        id: "visibility-shift",
        date: "2026-10-28",
        jobId: "default",
        startedAt: "2026-10-28T09:00:00+05:00",
        endedAt: "2026-10-28T17:00:00+05:00",
        lunchMinutes: 30,
        breakMinutes: 0,
        earnings: 180,
        currency: "USD",
      },
    ],
  });
  const toggle = page.getByRole("switch", { name: "Show Pay", exact: true });
  await expect(toggle).toHaveCount(1);
  await expect(toggle).not.toBeChecked();
  await expect(page.locator(".summary-amount")).not.toContainText("180.00");
  await toggle.getByText("Show Pay", { exact: true }).click();
  await expect(toggle).toBeChecked();
  await expect(page.locator(".summary-amount")).toHaveText("$180.00");
  for (const name of ["History", "Pay", "Jobs", "Settings", "Tracker"]) {
    await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link", { name, exact: true })
      .click();
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toBeChecked();
  }
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).not.toBeChecked();
  await expect
    .poll(async () => (await savedState(page)).payVisible)
    .toBe(false);
  await expect(page.locator(".summary-amount")).not.toContainText("180.00");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(toggle.getByText("Show Pay", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 390 || width === 1440)
      await page.screenshot({ path: info.outputPath(`show-pay-${width}.png`) });
  }
});

test("Show Pay syncs between tabs and retains its checked state when saving fails", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.clock.setFixedTime(new Date("2026-10-28T12:00:00+05:00"));
  await other.goto("/tracker");
  const toggle = page.getByRole("switch", { name: "Show Pay", exact: true });
  const otherToggle = other.getByRole("switch", {
    name: "Show Pay",
    exact: true,
  });
  await expect(otherToggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(otherToggle).toBeChecked();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === "current")
        throw new DOMException("Quota reached", "QuotaExceededError");
      return put.call(this, value, key!);
    };
  });
  await toggle.click();
  await expect(page.getByRole("status")).toContainText("Quota reached");
  await expect(toggle).toBeChecked();
  await expect(otherToggle).toBeChecked();
  expect((await savedState(page)).payVisible).toBe(true);
  await other.close();
});
