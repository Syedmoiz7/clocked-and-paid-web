import { test as base, expect } from "@playwright/test";

// Existing module scenarios enter through the real guest UI before exercising work.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date("2026-10-28T12:00:00+05:00"));
    await page.goto("/auth");
    await page
      .getByRole("button", { name: "Continue as Guest", exact: true })
      .click();
    await expect(page).toHaveURL(/\/tracker$/);
    await page.waitForLoadState("networkidle");
    await use(page);
  },
});
export { expect };
export type { Page } from "@playwright/test";
