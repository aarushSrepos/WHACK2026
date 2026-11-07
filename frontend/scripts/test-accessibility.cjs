/* eslint-disable @typescript-eslint/no-require-imports */
// No browser/network required: tests both methods' shared settings interpretation.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function load(relativePath, deps = {}) {
  const contents = fs.readFileSync(path.join(__dirname, relativePath), "utf8");
  const compiled = ts.transpileModule(contents, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", compiled)((id) => {
    if (id in deps) return deps[id];
    throw Error(`Unexpected dependency ${id}`);
  }, m, m.exports);
  return m.exports;
}

const settings = load("../src/lib/accessibility.ts");
const chat = load("../src/lib/accessibility-chat.ts", { "./accessibility": settings });
const original = settings.defaultSettings;
const explain = text => chat.interpretAccessibilityMessage(text, original).patch;

assert.deepEqual(explain("Make the text bigger and clearer"), { textSize: "large" });
assert.deepEqual(explain("Make text MUCH bigger and use high contrast"), { textSize: "xlarge", contrast: "high" });
assert.deepEqual(explain("I have dyslexia. Make reading easier"), { font: "atkinson", language: "simple" });
assert.deepEqual(explain("I have dyslexia"), {}); // Do not infer needs from a diagnosis alone.
assert.deepEqual(explain("Use simple language and no animations"), { language: "simple", motion: "reduce" });
assert.deepEqual(explain("Read the page aloud more slowly"), { speechEnabled: true, speechRate: "slow" });
assert.deepEqual(explain("Turn off read aloud"), { speechEnabled: false });
assert.deepEqual(explain("Keep standard contrast"), { contrast: "standard" });
assert.deepEqual(explain("Please reset all settings"), original);
assert.deepEqual(explain("More space between lines and larger buttons"), { readingSpacing: "relaxed", largeTargets: true });
assert.deepEqual(explain("Normal button sizes please"), { largeTargets: false });
assert.deepEqual(chat.validatePatch({ font: "malicious", language: "simple", contrast: "high", speechEnabled: "yes", broken: true }), { contrast: "high", language: "simple" });
console.log("✓ Accessibility assistant: 12 checks passed");
