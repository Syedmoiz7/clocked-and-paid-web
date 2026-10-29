import { test, expect } from "./helpers/guest";
import { savedState, seedState } from "./helpers/workspace";

test("client navigation uses desktop links and safe bottom tabs at narrow widths", async ({
  page,
}, info) => {
  await seedState(page, { isPremium: true });
  await expect(
    page.getByRole("heading", { name: "Today's Shift", exact: true }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  for (const width of [320, 390, 640, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(nav.getByRole("link")).toHaveCount(5);
    await expect(
      page.getByRole("switch", { name: "Show Pay", exact: true }),
    ).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    if (width <= 640) {
      expect(box!.y).toBeGreaterThan(800);
      expect(box!.y + box!.height).toBeLessThanOrEqual(901);
    } else expect(box!.y).toBeLessThan(150);
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: info.outputPath(`navigation-${width}.png`),
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  for (const label of ["History", "Pay", "Jobs", "Settings", "Tracker"]) {
    const link = nav.getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(link).toHaveAttribute("aria-current", "page");
  }
});

test("client-style settings switches keep keyboard, drafts and save behavior", async ({
  page,
}, info) => {
  await page.goto("/settings");
  await page.getByRole("tab", { name: "App", exact: true }).click();
  const toggle = page.getByRole("switch", {
    name: "Manual Time Editing",
    exact: true,
  });
  await expect(toggle).toBeChecked();
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).not.toBeChecked();
  expect((await savedState(page)).preferences.enableManualEditing).toBe(true);
  await page.getByRole("tab", { name: "Account", exact: true }).click();
  await page.getByRole("tab", { name: "App", exact: true }).click();
  await expect(toggle).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 900 });
  await toggle.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("settings-switches-390.png") });
  const save = page.getByRole("button", { name: "Save Changes", exact: true });
  const saveBox = await save.boundingBox(),
    navBox = await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .boundingBox();
  expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(navBox!.y);
  await save.click();
  await expect
    .poll(async () => (await savedState(page)).preferences.enableManualEditing)
    .toBe(false);
});

test("client header sign-in and confirmed sign-out retain the mock workspace", async ({
  page,
}, info) => {
  const before = await savedState(page);
  await page.getByRole("link", { name: "Sign In", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("demo");
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Skip for now — go straight to the app",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/tracker$/);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Sign out?", exact: true });
  await expect(dialog).toBeVisible();
  await expect(
    dialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .locator("svg"),
  ).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("sign-out-dialog.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect((await savedState(page)).auth.session).toBe("mock");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/auth$/);
  const after = await savedState(page);
  expect(after.auth.session).toBe("signed-out");
  expect(after.jobs).toEqual(before.jobs);
  expect(after.history).toEqual(before.history);
});
