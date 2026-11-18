const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('worker.js', 'utf8');
const part = (a, b) => source.slice(source.indexOf(a), source.indexOf(b));
function setup() {
  const calls = [];
  const ctx = {
    calls, fa: n => String(n), cancelServerDraft: async () => {},
    tg: async (env, method, payload) => { calls.push(payload); return { ok: true }; },
    getSettings: async () => ({ pay_text: 'کارت: 6219 8614 9829 6879', plans: [{ key: 'm', name: 'ماهانه', days: 30, price: 150000 }] }),
    pendingCode: async () => ({ code: 'A', percent: 10 }), priceAfter: (plan, code) => plan.price * (100 - code.percent) / 100,
    walletOffer: async () => {},
  };
  const db = { prepare: () => ({ bind() { return this; }, async run() { return {}; } }) };
  vm.createContext(ctx);
  vm.runInContext(part('function paymentCardMatches', 'const SERVER_PRODUCTS') + part('const TOPUP_MIN', 'async function sendPlans') + part('async function choosePlan', 'async function applyCode'), ctx);
  return { ctx, calls, db };
}
for (const [name, run, amount] of [
  ['wallet top-up', (ctx, db) => ctx.startTopup({}, db, 7, '7', 200000), '2000000'],
  ['discounted subscription', (ctx, db) => ctx.choosePlan({}, db, 7, '7', 'm'), '1350000'],
]) test(`${name} provides matching card and amount copy buttons`, async () => {
  const { ctx, calls, db } = setup();
  await run(ctx, db);
  const message = calls.at(-1);
  assert(message.text.includes('\u20666219861498296879\u2069'));
  const buttons = message.reply_markup.inline_keyboard.flat();
  assert.equal(buttons[0].copy_text.text, '6219861498296879');
  assert.equal(buttons[1].copy_text.text, amount);
});
