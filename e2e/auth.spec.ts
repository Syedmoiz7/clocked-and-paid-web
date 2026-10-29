import { test, expect, type Page } from "@playwright/test";
import { savedState, savedValue, seedState } from "./helpers/workspace";
test.use({ timezoneId: "Asia/Karachi" });
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T12:00:00+05:00"));
  await page.goto("/auth");
  await expect(
    page.getByRole("button", { name: "Continue as Guest", exact: true }),
  ).toBeVisible();
});
async function signIn(page: Page, email = "mock") {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
}
async function signup(page: Page, premium = false) {
  await page.getByRole("tab", { name: "Sign Up", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Saleem");
  await page.getByLabel("Email", { exact: true }).fill(" Demo@Example.test ");
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByLabel("Confirm password", { exact: true }).fill("x");
  await page
    .getByRole("radio", { name: premium ? "Premium" : "Free", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Create Account (mock)", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Confirm your mock account",
      exact: true,
    }),
  ).toBeVisible();
}
async function next(page: Page) {
  await page.getByLabel("Your name", { exact: true }).fill("Saleem");
  await page
    .getByRole("button", { name: "Next — set up your first job", exact: true })
    .click();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveCount(0);
}
test("fresh work routes require entry; guest resumes an empty workspace after reload", async ({
  page,
}) => {
  await page.goto("/history");
  await expect(page).toHaveURL(/\/auth$/);
  await page
    .getByRole("button", { name: "Continue as Guest", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tracker$/);
  expect((await savedState(page)).history).toEqual([]);
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Track your time. Know your pay.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Open your workspace →", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tracker$/);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/tracker$/);
});
test("sign-in accepts mock values, keeps inputs on validation and forces setup before work", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator(".auth-message[role=alert]")).toBeVisible();
  await signIn(page);
  expect((await savedState(page)).account.email).toBe("mock");
  await page.goto("/pay");
  await expect(page).toHaveURL(/\/onboarding$/);
  await page
    .getByRole("button", {
      name: "Skip for now — go straight to the app",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/tracker$/);
  await page.goto("/auth");
  await expect(page).toHaveURL(/\/tracker$/);
});
test("signup Premium remains pending across reload, activates once and rejects replay", async ({
  page,
}) => {
  await signup(page, true);
  expect((await savedState(page)).isPremium).toBe(false);
  await page.reload();
  await page
    .getByRole("button", { name: "Open mock confirmation", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Confirm & continue (mock)",
      exact: true,
    }),
  ).toBeVisible();
  const callback = page.url();
  await page
    .getByRole("button", { name: "Confirm & continue (mock)", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding$/);
  const state = await savedState(page);
  expect(state.isPremium).toBe(true);
  expect(state.auth.pending).toBeNull();
  expect(state.account.email).toBe("demo@example.test");
  await page.goto(callback);
  await expect(
    page.getByRole("heading", { name: "Link unavailable", exact: true }),
  ).toBeVisible();
  expect(await savedState(page)).toEqual(state);
});
test("resend invalidates an old callback; stale cancellation preserves the newer flow", async ({
  page,
}) => {
  await signup(page, true);
  const old = (await savedState(page)).auth.pending!;
  await page
    .getByRole("button", {
      name: "Prepare confirmation again (no email)",
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await savedState(page)).auth.pending?.id)
    .not.toBe(old.id);
  const fresh = (await savedState(page)).auth.pending;
  await page.goto(`/auth-callback?demo=1&flow=confirmation&id=${old.id}`);
  await expect(
    page.getByRole("heading", { name: "Link unavailable", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to Sign In", exact: true })
    .click();
  await expect(page).toHaveURL(/\/auth$/);
  expect((await savedState(page)).auth.pending).toEqual(fresh);
  await page
    .getByRole("button", { name: "Back to Sign In", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sign In", exact: true }),
  ).toBeVisible();
  expect((await savedState(page)).auth.pending).toBeNull();
  expect((await savedState(page)).isPremium).toBe(false);
});
test("expired confirmation cannot activate a plan or account", async ({
  page,
}) => {
  await signup(page, true);
  const state = await savedState(page);
  await seedState(page, {
    auth: {
      ...state.auth,
      pending: { ...state.auth.pending!, createdAt: Date.now() - 86400000000 },
    },
  });
  await page
    .getByRole("button", { name: "Open mock confirmation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Link unavailable", exact: true }),
  ).toBeVisible();
  expect((await savedState(page)).auth.session).toBe("signed-out");
  expect((await savedState(page)).isPremium).toBe(false);
});
test("Free setup replaces only unused starter, survives reload and prevents duplicate saves", async ({
  page,
}) => {
  await signIn(page);
  await next(page);
  await page.reload();
  await expect(
    page.getByLabel("Company / job name", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
    "Saleem",
  );
  await next(page);
  await page.getByLabel("Company / job name", { exact: true }).fill("Acme");
  await page
    .getByRole("button", { name: "Save this job", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your job is ready", exact: true }),
  ).toBeVisible();
  const state = await savedState(page);
  expect(state.jobs).toHaveLength(1);
  expect(state.jobs[0].name).toBe("Acme");
  expect(state.jobs[0].hourlyRate).toBe(state.defaultPlan.hourlyRate);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your job is ready", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save this job", exact: true }),
  ).toHaveCount(0);
  expect((await savedState(page)).jobs).toEqual(state.jobs);
  await page
    .getByRole("button", { name: "Continue to app", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tracker$/);
});
test("guest conversion retains running work; Free can keep profiles or upgrade and add jobs", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Continue as Guest", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tracker$/);
  const initial = await savedState(page);
  const activeShift = {
    id: "running",
    endedAt: null,
    earnings: 0,
    date: "2026-10-28",
    jobId: "default",
    startedAt: "2026-10-28T09:00:00+05:00",
    lunchMinutes: 0,
    breakMinutes: 0,
  };
  await seedState(page, { activeShift });
  await page.goto("/auth");
  await signIn(page);
  await next(page);
  await expect(
    page.getByRole("button", {
      name: "Keep existing jobs & continue",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Company / job name", { exact: true }),
  ).toHaveCount(0);
  expect((await savedState(page)).activeShift).toEqual(activeShift);
  expect((await savedState(page)).jobs).toEqual(initial.jobs);
  await page
    .getByRole("button", { name: "Preview Premium for more jobs", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Back to Setup →", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Start Premium preview (no charge)",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page
    .getByLabel("Company / job name", { exact: true })
    .fill("Second job");
  await page
    .getByLabel("Base pay rate / hr (optional)", { exact: true })
    .fill("-2");
  await page
    .getByRole("button", { name: "Save this job", exact: true })
    .click();
  await expect(page.locator(".auth-message[role=alert]")).toBeVisible();
  await page
    .getByLabel("Base pay rate / hr (optional)", { exact: true })
    .fill("32");
  await page
    .getByRole("button", { name: "Save this job", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your job is ready", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "+ Add another job", exact: true })
    .click();
  await expect(
    page.getByLabel("Company / job name", { exact: true }),
  ).toHaveValue("");
  expect((await savedState(page)).jobs).toHaveLength(2);
  expect((await savedState(page)).activeShift).toEqual(activeShift);
});
test("recovery validates, stores a salted digest outside workspace and never signs in", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("mock");
  await page
    .getByRole("button", { name: "Prepare mock reset link", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open mock password recovery", exact: true })
    .click();
  await page
    .getByLabel("New password (6+ characters)", { exact: true })
    .fill("short");
  await page.getByLabel("Confirm password", { exact: true }).fill("short");
  await page
    .getByRole("button", { name: "Set Password (mock)", exact: true })
    .click();
  await expect(page.locator(".auth-message[role=alert]")).toBeVisible();
  await page
    .getByLabel("New password (6+ characters)", { exact: true })
    .fill("demo-password");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("demo-password");
  await page
    .getByRole("button", { name: "Set Password (mock)", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mock password updated", exact: true }),
  ).toBeVisible();
  const state = await savedState(page);
  expect(state.auth.session).toBe("signed-out");
  expect(state.auth.pending).toBeNull();
  expect(JSON.stringify(await savedValue(page))).not.toContain("demo-password");
  const digest = await page.evaluate(async () => {
    const open = indexedDB.open("clocked-paid-web-private", 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      open.onsuccess = () => resolve(open.result);
    });
    const request = db
      .transaction("credentials")
      .objectStore("credentials")
      .get("mock-password");
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return result;
  });
  expect(digest.iterations).toBe(210000);
  expect(digest.hash).toBeTruthy();
  expect(JSON.stringify(digest)).not.toContain("demo-password");
});
test("external query and fragment tokens are rejected and removed from the address", async ({
  page,
}) => {
  for (const suffix of [
    "?code=external-secret",
    "#access_token=external-secret&refresh_token=another-secret",
  ]) {
    await page.goto(`/auth-callback${suffix}`);
    await expect(page.locator(".auth-message[role=alert]")).toContainText(
      "Real authentication links",
    );
    await expect(page).toHaveURL(/\/auth-callback$/);
    expect(JSON.stringify(await savedValue(page))).not.toContain("secret");
  }
});
test("failed authentication save keeps credentials and cannot enter workspace", async ({
  page,
}) => {
  const before = await savedValue(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === "current")
        throw new DOMException("Quota reached", "QuotaExceededError");
      return put.call(this, value, key!);
    };
  });
  await page.getByLabel("Email", { exact: true }).fill("mock");
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page.locator(".auth-message[role=alert]")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("x");
  expect(await savedValue(page)).toEqual(before);
  await expect(page).toHaveURL(/\/auth$/);
});
test("auth and setup fit desktop and narrow screens with visible form labels", async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("tab", { name: "Sign Up", exact: true }).click();
    await expect(
      page.getByRole("group", { name: "Choose your plan", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/auth-signup-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("tab", { name: "Sign In", exact: true }).click();
  }
  await signIn(page);
  await next(page);
  await page.screenshot({
    path: "test-results/auth-setup-390.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("sign-out guards another open tab, preserves work and remembers completed identity", async ({
  page,
  context,
}) => {
  await signIn(page, "demo");
  await page
    .getByRole("button", {
      name: "Skip for now — go straight to the app",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/tracker$/);
  const state = await savedState(page);
  const other = await context.newPage();
  await other.goto("/history");
  await expect(
    other.getByRole("heading", { name: "Work History", exact: true }),
  ).toBeVisible();
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Sign out of mock account", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(page).toHaveURL(/\/auth$/);
  await expect(other).toHaveURL(/\/auth$/);
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  const signedOut = await savedState(page);
  expect(signedOut.jobs).toEqual(state.jobs);
  expect(signedOut.history).toEqual(state.history);
  await page.getByLabel("Password", { exact: true }).fill("another");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/tracker$/);
  await other.close();
});

test("private credential failure keeps recovery flow and inputs retryable", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  await page.getByLabel("Email", { exact: true }).fill("mock");
  await page
    .getByRole("button", { name: "Prepare mock reset link", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open mock password recovery", exact: true })
    .click();
  const before = await savedValue(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (key === "mock-password")
        throw new DOMException("Credential save failed", "QuotaExceededError");
      return put.call(this, value, key!);
    };
  });
  await page
    .getByLabel("New password (6+ characters)", { exact: true })
    .fill("demo-password");
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill("demo-password");
  await page
    .getByRole("button", { name: "Set Password (mock)", exact: true })
    .click();
  await expect(page.locator(".auth-message[role=alert]")).toContainText(
    "Credential save failed",
  );
  await expect(
    page.getByLabel("New password (6+ characters)", { exact: true }),
  ).toHaveValue("demo-password");
  expect(await savedValue(page)).toEqual(before);
});

test("privacy lock covers direct auth and callback navigation", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Continue as Guest", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tracker$/);
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
  for (const route of [
    "/auth",
    "/auth-callback?demo=1&flow=recovery&id=invalid",
  ]) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: "Workspace locked", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue as Guest", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Set Password (mock)", exact: true }),
    ).toHaveCount(0);
  }
});
