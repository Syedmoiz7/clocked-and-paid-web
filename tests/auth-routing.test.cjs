const fs = require("node:fs"),
  ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  authRedirect,
  planReturn,
  callbackParams,
} = require("../src/features/auth/routing.ts");
const actions = require("../src/store/appSlice.ts");
const { mockAccount } = require("../src/features/auth/model.ts");
test("web routes guard work and setup without blocking callback feedback", () => {
  const initial = actions.initialAppState;
  for (const path of [
    "/",
    "/tracker",
    "/history",
    "/pay",
    "/jobs",
    "/settings",
    "/plans",
    "/onboarding",
  ])
    assert.equal(authRedirect(initial, path), "/auth");
  assert.equal(authRedirect(initial, "/auth-callback"), null);
  const guest = actions.appReducer(initial, actions.enterGuest());
  assert.equal(authRedirect(guest, "/tracker"), null);
  assert.equal(authRedirect(guest, "/onboarding"), "/tracker");
  const mock = actions.appReducer(
    guest,
    actions.enterMockSession(mockAccount("mock")),
  );
  assert.equal(authRedirect(mock, "/history"), "/onboarding");
  assert.equal(authRedirect(mock, "/plans"), null);
  assert.equal(authRedirect(mock, "/onboarding"), null);
});
test("plan return accepts only known app destinations including setup review", () => {
  for (const value of [
    "constructor",
    "__proto__",
    "//example.test",
    "https://example.test",
    "/auth-callback",
    null,
  ])
    assert.equal(planReturn(value), "/tracker");
  assert.equal(planReturn("jobs"), "/jobs");
  assert.equal(planReturn("/onboarding?review=1"), "/onboarding?review=1");
});
test("callback parser detects external credentials without returning their values", () => {
  for (const [search, hash] of [
    ["?code=secret", ""],
    ["?demo=1&id=nonce", "#access_token=secret"],
    ["?token_hash=secret", ""],
  ]) {
    const value = callbackParams(search, hash);
    assert.equal(value.external, true);
    assert.equal(JSON.stringify(value).includes("secret"), false);
  }
  assert.deepEqual(callbackParams("?demo=1&flow=recovery&id=nonce"), {
    demo: "1",
    flow: "recovery",
    id: "nonce",
    external: false,
  });
});
