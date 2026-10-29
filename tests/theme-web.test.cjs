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
const test = require("node:test"),
  assert = require("node:assert/strict");
const { hslLuminance, accentInk, themeStyle } = require("../src/lib/theme.ts");
const { themeOptions } = require("../src/features/settings/model.ts");
test("theme luminance matches standard black, white and red reference values", () => {
  assert.equal(hslLuminance(0, 0, 0), 0);
  assert.equal(hslLuminance(0, 0, 100), 1);
  assert.equal(hslLuminance(0, 100, 50), 0.2126);
});
test("all supported theme button and swatch labels meet AA text contrast", () => {
  for (const { hue } of themeOptions)
    for (const lightness of [53, 55]) {
      const background = hslLuminance(hue, 62, lightness);
      const contrast =
        accentInk(hue, lightness) === "#fff"
          ? 1.05 / (background + 0.05)
          : (background + 0.05) / 0.05;
      assert.ok(contrast >= 4.5, `${hue} at ${lightness}: ${contrast}`);
    }
});
test("all supported theme accent labels meet AA against selected-control surfaces", () => {
  for (const { hue } of themeOptions) {
    const style = themeStyle(hue),
      lightness = Number(style["--pink"].match(/ (\d+)%\)$/)[1]);
    assert.ok(
      (hslLuminance(hue, 62, lightness) + 0.05) /
        (hslLuminance(hue, 32, 14) + 0.05) >=
        4.7,
    );
  }
});
