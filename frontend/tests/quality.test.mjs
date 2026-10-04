import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/components/groove/room/quality.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

function setup(query = "", coarse = false) {
  const exports = {};
  runInNewContext(compiled, {
    exports, URLSearchParams,
    navigator: { hardwareConcurrency: 4, deviceMemory: 4 },
    window: { location: { search: query }, matchMedia: () => ({ matches: coarse }) },
    document: { createElement: () => ({ getContext: () => null }) },
  });
  return exports;
}

test("desktop defaults to the full-detail room even without a GPU hint", () => {
  assert.equal(setup().detectQuality(), "high");
});
test("touch and explicit quality overrides remain supported", () => {
  assert.equal(setup("", true).detectQuality(), "medium");
  assert.equal(setup("?quality=low").detectQuality(), "low");
  assert.equal(setup("?quality=high", true).detectQuality(), "high");
});
test("desktop rendering supersamples 1x displays and caps expensive 4x displays", () => {
  const { resolutionFor } = setup();
  assert.equal(resolutionFor("high", 1), 1.5);
  assert.equal(resolutionFor("high", 4), 2);
});
test("sustained slow frames cannot make high-quality rendering blurry", () => {
  const { adjustResolution } = setup();
  let ratio = 2;
  for (let i = 0; i < 100; i++) ratio = adjustResolution("high", ratio, 2, 1 / 20);
  assert.equal(ratio, 1.5);
  assert.equal(adjustResolution("medium", 1, 1.5, 1 / 20), 1);
});
test("resolution recovers after sustained fast frames instead of degrading forever", () => {
  const { adjustResolution } = setup();
  let ratio = 1.5;
  for (let i = 0; i < 100; i++) ratio = adjustResolution("high", ratio, 2, 1 / 60);
  assert.equal(ratio, 2);
});
