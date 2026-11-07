/* eslint-disable @typescript-eslint/no-require-imports */
// Run with `npm run test:demo`. Exercises the local-only sample ledger.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("typescript");

const content = fs.readFileSync(path.join(__dirname, "../src/lib/mock-bank.ts"), "utf8");
const js = ts.transpileModule(content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const store = new Map();
const sandboxModule = { exports: {} };
const ctx = { module: sandboxModule, exports: sandboxModule.exports, console, Date, Math, Intl,
  localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) }, };
vm.runInNewContext(js, ctx, { filename: "mock-bank.js" });
const bank = sandboxModule.exports.mockBank;
(async () => {
  const p = "priya";
  const starting = await bank.me(p);
  assert.equal(starting.account.balance_pence, 128475);
  assert.equal((await bank.transactions(p)).transactions.length, 9);
  const proposal = await bank.propose(p, { type: "pay", amount_pence: 3500 });
  assert.match(proposal.read_back, /£35/);
  await bank.confirm(p, proposal.action_id);
  assert.equal((await bank.me(p)).account.balance_pence, 124975);
  await assert.rejects(() => bank.confirm(p, proposal.action_id));
  await bank.setLimit(p, 40000);
  await bank.spend(p, "Demo purchase", 4000);
  assert.equal((await bank.me(p)).spending.percent_used, 80);
  const pause = await bank.propose(p, { type: "pause_card" });
  await bank.confirm(p, pause.action_id);
  await assert.rejects(() => bank.spend(p, "Demo purchase", 4000));
  const resume = await bank.propose(p, { type: "unpause_card" });
  await bank.confirm(p, resume.action_id);
  await assert.rejects(() => bank.propose(p, { type: "dispute", transaction_id: "tx_042" }));
  const question = await bank.ask(p, "When is my payment due?", "simple");
  assert.match(question.answer, /due/);
  await bank.reset(p);
  assert.equal((await bank.me(p)).account.balance_pence, 128475);
  console.log("✓ Local demo ledger: 10 checks passed");
})().catch(error => {console.error(error); process.exitCode = 1;});
