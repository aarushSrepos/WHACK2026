/* eslint-disable @typescript-eslint/no-require-imports */
// Run with `npm run test:credit-coach`. Checks the browser port of the credit score model
// (src/lib/credit-coach/engine.ts) against predictions made by Python/scikit-learn when
// the model was trained (public/credit-coach/fixtures.json), and checks the advice is sane.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("typescript");

const load = (file) => {
  const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: () => ({}), console, Math, Set, Object, Array, Number, fetch: undefined }, { filename: file });
  return mod.exports;
};
const engine = load("src/lib/credit-coach/engine.ts");
const profiles = load("src/lib/credit-coach/profiles.ts");
const model = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/credit-coach/model.json"), "utf8"));
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, "../public/credit-coach/fixtures.json"), "utf8"));

let checks = 0;
for (const f of fixtures) {
  const score = engine.predict(model, f.profile);
  assert.ok(Math.abs(score - f.score) < 0.01, `score drift ${score} vs ${f.score}`);
  const gains = engine.actionGains(model, f.profile);
  assert.deepEqual(Object.keys(gains).sort(), Object.keys(f.gains12).sort(), "same actions apply");
  for (const [a, g] of Object.entries(f.gains12)) assert.ok(Math.abs(gains[a] - g) < 0.01, `${a} gain drift ${gains[a]} vs ${g}`);
  checks++;
}
console.log(`✓ Browser model matches Python on ${checks} profiles (scores and every action's gain)`);

// Every demo customer gets a sensible, personal plan.
const expectTop = { priya: "lower_utilisation", sam: "electoral_roll", alex: "on_time_payments" };
const balances = { priya: 1284.75, sam: 850, amara: 975.6, alex: 642.3 };
for (const [persona, file] of Object.entries(profiles.DEMO_FILES)) {
  const p = profiles.toProfile(file, balances[persona], 4000);
  const r = engine.analyse(model, p);
  assert.ok(r.score >= 0 && r.score <= 999);
  assert.equal(r.projection.length, 25);
  for (const a of r.actions) assert.ok(a.points >= 3, "only worthwhile steps are shown");
  assert.ok(r.projection[12].plan >= r.projection[12].now - 1, "following the plan never ends worse");
  if (expectTop[persona]) assert.equal(r.actions[0]?.id, expectTop[persona], `${persona}'s first step`);
  console.log(`  ${persona.padEnd(6)} ${Math.round(r.score)} ${r.band.name.padEnd(9)} ${r.segment.name.padEnd(36)} -> ${r.actions.map(a => `${a.id} +${Math.round(a.points)}`).join(", ") || "(keep going)"}`);
}
assert.ok(engine.analyse(model, profiles.toProfile(profiles.DEMO_FILES.amara, 975.6, 4000)).score > 900, "Amara's clean file scores well");
console.log("✓ Demo customers each get a plan that fits their situation");
