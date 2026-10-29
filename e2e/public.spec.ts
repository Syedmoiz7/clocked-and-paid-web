import { test, expect, type Page } from "@playwright/test";
import { savedState, savedValue, seedState } from "./helpers/workspace";
test.use({ timezoneId: "Asia/Karachi" });
const homeTitle = "Track your time. Know your pay.";
async function guest(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Try as guest", exact: true }).click();
  await expect(page).toHaveURL(/\/tracker$/);
  await expect(
    page.getByRole("heading", { name: "Today's Shift", exact: true }),
  ).toBeVisible();
}
test("landing starts a real guest workspace without seeding example earnings", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: homeTitle, exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Illustrative earnings preview")).toContainText(
    "Example only",
  );
  await page.getByRole("link", { name: "Try as guest", exact: true }).click();
  await expect(page).toHaveURL(/\/tracker$/);
  const data = await savedState(page);
  expect(data.auth.session).toBe("guest");
  expect(data.history).toEqual([]);
  expect(data.activeShift).toBeNull();
});
test("landing signup opens signup directly and includes exactly two plan choices", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Create free account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(
    page.getByRole("heading", { name: "Create your account", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(2);
  await expect(
    page.getByRole("radio", { name: "Free", exact: true }),
  ).toBeChecked();
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Sign Up", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("navigation", { name: "Information", exact: true })
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await expect(
    page.getByRole("heading", { name: "Sign In", exact: true }),
  ).toBeVisible();
});
test("information pages and 404 work even when all browser storage is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new Error("Storage blocked for test");
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [route, title] of [
    ["/", homeTitle],
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Service"],
    ["/contact", "Contact"],
    ["/missing-page", "Page not found"],
  ]) {
    const response = await page.goto(route);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    if (route === "/missing-page") expect(response?.status()).toBe(404);
    await expect(
      page.getByText("Workspace unavailable", { exact: true }),
    ).toHaveCount(0);
    await page.waitForLoadState("networkidle");
  }
  expect(errors).toEqual([]);
});
test("footer legal navigation and contact links have real destinations and accurate demo copy", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Information", exact: true })
    .getByRole("link", { name: "Privacy Policy", exact: true })
    .click();
  await expect(page).toHaveTitle("Privacy Policy · Clocked & Paid");
  await expect(
    page.getByRole("heading", { name: "How data is stored", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Both guest and mock-account modes", { exact: false }),
  ).toContainText("IndexedDB");
  await page
    .getByRole("navigation", { name: "Information", exact: true })
    .getByRole("link", { name: "Terms of Service", exact: true })
    .click();
  await expect(page).toHaveTitle("Terms of Service · Clocked & Paid");
  await page
    .getByRole("navigation", { name: "Information", exact: true })
    .getByRole("link", { name: "Contact", exact: true })
    .click();
  await expect(page).toHaveTitle("Contact · Clocked & Paid");
  await expect(page.getByRole("link", { name: /Email us/ })).toHaveAttribute(
    "href",
    "mailto:clockedandpaid@gmail.com",
  );
  await expect(
    page.getByText("Opens your email app.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: homeTitle, exact: true }),
  ).toBeVisible();
});
test("copy email confirms clipboard success and handles denial without false success", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as unknown as { copied: string }).copied = value;
        },
      },
    }),
  );
  await page.goto("/contact");
  await page
    .getByRole("button", { name: "Copy email address", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Email address copied. No message was sent.",
  );
  expect(
    await page.evaluate(() => (window as unknown as { copied: string }).copied),
  ).toBe("clockedandpaid@gmail.com");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await page
    .getByRole("button", { name: "Copy email address", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Could not copy automatically",
  );
});
test("visiting public pages preserves a running guest workspace and return resumes it", async ({
  page,
}) => {
  await guest(page);
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  await expect
    .poll(async () => (await savedState(page)).activeShift?.id)
    .toBeTruthy();
  const before = await savedValue(page);
  const active = (await savedState(page)).activeShift;
  await page
    .getByRole("navigation", { name: "Information", exact: true })
    .getByRole("link", { name: "Contact", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Contact", exact: true }),
  ).toBeVisible();
  expect(await savedValue(page)).toEqual(before);
  await page
    .getByRole("link", { name: "Open your workspace", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tracker$/);
  await expect(
    page.getByRole("button", { name: "Clock out", exact: true }),
  ).toBeVisible();
  expect((await savedState(page)).activeShift).toEqual(active);
});
test("locked users can read public pages but workspace entry still requires unlocking", async ({
  page,
}) => {
  await guest(page);
  await page.goto("/settings");
  await page.getByRole("tab", { name: "App", exact: true }).click();
  await page.getByLabel("New PIN / password", { exact: true }).fill("0123");
  await page.getByLabel("Confirm new credential", { exact: true }).fill("0123");
  await page
    .getByRole("button", { name: "Enable privacy lock", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Lock now", exact: true }),
  ).toBeVisible();
  const state = await savedState(page);
  await seedState(page, { auth: { ...state.auth, session: "signed-out" } });
  await expect(page).toHaveURL(/\/auth$/);
  await expect(
    page.getByRole("heading", { name: "Workspace locked", exact: true }),
  ).toBeVisible();
  const lockedSnapshot = await savedValue(page);
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "Privacy Policy", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Privacy Policy · Clocked & Paid");
  await expect(
    page.getByRole("heading", { name: "Workspace locked", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Back to home", exact: true }).click();
  await page.getByRole("link", { name: "Try as guest", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Workspace locked", exact: true }),
  ).toBeVisible();
  expect(await savedValue(page)).toEqual(lockedSnapshot);
  expect((await savedState(page)).auth.session).toBe("signed-out");
  await page.getByLabel("PIN / password", { exact: true }).fill("0123");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page).toHaveURL(/\/tracker$/);
  expect((await savedState(page)).auth.session).toBe("guest");
});
test("guest and signup CTAs preserve an existing completed mock session", async ({
  page,
}) => {
  await page.goto("/auth");
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
  const before = await savedState(page);
  for (const cta of ["Try as guest", "Create free account"]) {
    await page.goto("/");
    await page.getByRole("link", { name: cta, exact: true }).click();
    await expect(page).toHaveURL(/\/tracker$/);
    expect((await savedState(page)).auth).toEqual(before.auth);
    expect((await savedState(page)).account).toEqual(before.account);
  }
});
test("public pages fit desktop and narrow screens and expose keyboard skip navigation", async ({
  page,
  browserName,
}) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/privacy", "/terms", "/contact"]) {
      await page.goto(route);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.getByRole("main")).toBeVisible();
      if (width !== 320)
        await page.screenshot({
          path: `test-results/public-${route.slice(1) || "landing"}-${width}.png`,
          fullPage: true,
        });
    }
  }
  await page.goto("/");
  await page.keyboard.press(
    browserName === "webkit" && process.platform === "darwin"
      ? "Alt+Tab"
      : "Tab",
  );
  await expect(
    page.getByRole("link", { name: "Skip to content", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/#main$/);
});
