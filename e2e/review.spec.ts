import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { savedState, seedState } from "./helpers/workspace";
import type { Shift } from "../src/types";
import { themeOptions } from "../src/features/settings/model";
test.use({ timezoneId: "Asia/Karachi", actionTimeout: 10000 });
test.setTimeout(120000);
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00+05:00"));
});
const routes = ["tracker", "history", "pay", "jobs", "settings"];
const shift: Shift = {
  id: "review-shift",
  date: "2026-10-28",
  jobId: "default",
  currency: "USD",
  startedAt: "2026-10-28T09:00:00+05:00",
  endedAt: "2026-10-28T17:00:00+05:00",
  lunchMinutes: 30,
  breakMinutes: 0,
  earnings: 180,
  customRate: 24,
};
async function enter(page: Page, premium = false) {
  await page.goto("/auth");
  await page
    .getByRole("button", { name: "Continue as Guest", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tracker$/);
  const state = await savedState(page);
  await seedState(page, {
    isPremium: premium,
    payVisible: true,
    history: [shift],
    preferences: { ...state.preferences, payHiddenByDefault: false },
  });
  await expect(
    page.getByRole("heading", { name: "Today's Shift", exact: true }),
  ).toBeVisible();
  await revealPay(page);
  await page.waitForLoadState("networkidle");
}
async function revealPay(page: Page) {
  const show = page.getByRole("button", { name: "Show pay", exact: true });
  if (await show.count()) await show.click();
  await expect(
    page.getByRole("button", { name: "Hide pay", exact: true }),
  ).toBeVisible();
}
function audit(page: Page, info: TestInfo) {
  const issues: unknown[] = [];
  return {
    async scan(label: string) {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      for (const item of results.violations)
        issues.push({
          page: label,
          rule: item.id,
          impact: item.impact,
          description: item.description,
          nodes: item.nodes.map((node) => ({
            target: node.target,
            summary: node.failureSummary,
          })),
        });
    },
    async finish() {
      await info.attach("accessibility-findings", {
        body: JSON.stringify(issues, null, 2),
        contentType: "application/json",
      });
      expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
    },
  };
}
test("WCAG scan covers public pages and authentication states", async ({
  page,
}, info) => {
  const review = audit(page, info);
  for (const route of [
    "/",
    "/privacy",
    "/terms",
    "/contact",
    "/auth",
    "/signup",
    "/auth-callback?demo=1&id=invalid",
  ]) {
    await page.goto(route);
    await expect(page.getByRole("main")).toBeVisible();
    await review.scan(route);
  }
  await page.goto("/");
  await page
    .getByRole("link", { name: "Create free account", exact: true })
    .hover();
  await review.scan("landing primary action hovered");
  await page.goto("/auth");
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await review.scan("forgot password");
  await review.finish();
});
test("WCAG scan covers populated Free and Premium modules, panels and settings", async ({
  page,
}, info) => {
  await enter(page);
  const review = audit(page, info);
  for (const premium of [false, true]) {
    if (premium) {
      await seedState(page, { isPremium: true, payVisible: true });
      await expect(
        page.getByRole("heading", { name: "Settings", exact: true }),
      ).toBeVisible();
      await revealPay(page);
    }
    for (const route of routes) {
      await page.goto(`/${route}`);
      await expect(page.getByRole("main")).toBeVisible();
      await review.scan(`${premium ? "Premium" : "Free"} ${route}`);
      if (route === "tracker") {
        const tabs = page
          .getByRole("tablist", { name: "Tracker sections", exact: true })
          .getByRole("tab");
        for (let index = 0; index < (await tabs.count()); index++) {
          await tabs.nth(index).click();
          await review.scan(`${premium ? "Premium" : "Free"} Tracker ${index}`);
        }
      }
      if (route === "settings") {
        await page.getByRole("tab", { name: "App", exact: true }).click();
        await review.scan(`${premium ? "Premium" : "Free"} Settings App`);
      }
    }
  }
  await review.finish();
});
test("WCAG scan covers editing dialogs, calendar and advanced pay forms", async ({
  page,
}, info) => {
  await enter(page, true);
  const review = audit(page, info);
  await page.goto("/history");
  await page.getByRole("button", { name: "Add shift", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await review.scan("History add shift dialog");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await review.scan("History Calendar");
  await page.goto("/jobs");
  await page.getByRole("button", { name: "Add job", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await review.scan("Jobs add job dialog");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto("/pay");
  await page
    .getByRole("button", { name: "+ Add deduction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await review.scan("Pay deduction dialog");
  await review.finish();
});
test("populated modules fit narrow, tablet and desktop viewports without page overflow", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page, true);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`/${route}`);
      await expect(page.getByRole("main")).toBeVisible();
      await page.waitForLoadState("networkidle");
      const excess = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      expect(excess, `${route} at ${width}px`).toBeLessThanOrEqual(1);
      if (width === 390)
        await page.screenshot({
          path: info.outputPath(`${route}-390.png`),
          fullPage: true,
        });
    }
  }
  expect(errors).toEqual([]);
});
test("keyboard navigation switches tabs, traps dialog focus, closes and restores focus", async ({
  page,
}) => {
  await enter(page, true);
  const tabs = page
    .getByRole("tablist", { name: "Tracker sections", exact: true })
    .getByRole("tab");
  await tabs.first().focus();
  await page.keyboard.press("End");
  await expect(tabs.last()).toBeFocused();
  await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Account", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "App", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tabpanel", { name: "App", exact: true }),
  ).toBeVisible();
  await page.goto("/jobs");
  const opener = page.getByRole("button", { name: "Add job", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add job", exact: true });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .focus();
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);
  for (let index = 0; index < 35; index++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  const state = await savedState(page);
  expect(state.jobs).toHaveLength(1);
  await page.goto("/auth");
  await page.getByRole("tab", { name: "Sign In", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Sign Up", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tabpanel", { name: "Sign Up", exact: true }),
  ).toBeVisible();
});

test("all twelve theme palettes keep selected controls and text readable", async ({
  page,
}, info) => {
  await enter(page, true);
  await page.goto("/settings");
  await page.getByRole("tab", { name: "App", exact: true }).click();
  const review = audit(page, info);
  for (const option of themeOptions) {
    const swatch = page.getByRole("button", {
      name: option.label,
      exact: true,
    });
    await swatch.click();
    await expect(swatch).toHaveAttribute("aria-pressed", "true");
    await review.scan(`Theme ${option.label}`);
  }
  await review.finish();
});
