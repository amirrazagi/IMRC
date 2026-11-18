const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

function setup() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE server_drafts(tg_id TEXT PRIMARY KEY, token TEXT, product TEXT, stage TEXT, volume INTEGER, days INTEGER, users INTEGER, amount INTEGER, created INTEGER);
    CREATE TABLE server_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,tg_id TEXT,product TEXT,volume INTEGER,days INTEGER,users INTEGER,amount INTEGER,file_id TEXT,status TEXT,created INTEGER,admin_msg_id INTEGER,decided INTEGER,decided_by TEXT);
    CREATE TABLE server_deliveries(order_id INTEGER,source_chat TEXT,source_message INTEGER,created INTEGER, PRIMARY KEY(source_chat,source_message));
    CREATE TABLE pending_buy(tg_id TEXT PRIMARY KEY); CREATE TABLE bot_state(tg_id TEXT PRIMARY KEY, awaiting TEXT);`);
  const db = { prepare(query) { let values = []; return { bind(...v) { values = v; return this; }, async run() { const r = sql.prepare(query).run(...values); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, async first() { return sql.prepare(query).get(...values) || null; } }; }, async batch(stmts) { for (const stmt of stmts) await stmt.run(); } };
  const calls = [];
  let failPhoto = false;
  const ctx = { console, db, calls, fa: n => String(n), randHex: () => 'a'.repeat(16), isBanned: async () => false, adminTgId: env => env.ADMIN_TG_ID, isAdmin: (env, id) => String(id) === env.ADMIN_TG_ID, getSettings: async () => ({ pay_text: 'CARD' }), stampReceipt: async () => {}, tg: async (env, method, payload) => { calls.push({ method, payload }); return method === 'sendPhoto' ? (failPhoto ? { ok: false } : { ok: true, result: { message_id: 55 } }) : { ok: true }; } };
  vm.createContext(ctx);
  const source = fs.readFileSync('worker.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('// سفارش سرور:'), source.indexOf('// ===== کیف پول:')), ctx);
  return { ctx, db, sql, calls, setFail: x => { failPhoto = x; }, env: { ADMIN_TG_ID: '99' }, msg: { chat: { id: 7 }, from: { id: 7, first_name: 'Test' }, photo: [{ file_id: 'photo' }] } };
}
test('volume order computes unit price times volume, independent of 1-30 days, and delivers only after approval', async () => {
  const { ctx, sql, calls, env, db, msg } = setup();
  await ctx.serverChoose(env, db, 7, '7', 'wire');
  await ctx.serverInput(env, db, msg, '۲۰');
  await ctx.serverInput(env, db, msg, '۳۱');
  assert.equal(sql.prepare('SELECT stage FROM server_drafts').get().stage, 'days');
  await ctx.serverInput(env, db, msg, '۱۵');
  assert.match(calls.at(-1).payload.text, /400000/);
  await ctx.serverReceipt(env, db, msg);
  const order = sql.prepare('SELECT * FROM server_orders').get();
  assert.equal(order.amount, 400000); assert.equal(order.days, 15); assert.equal(order.status, 'pending');
  const adminMsg = { chat: { id: 99 }, from: { id: 99 }, message_id: 100, document: { file_id: 'config' }, reply_to_message: { message_id: 55 } };
  await ctx.serverDelivery(env, db, adminMsg);
  assert(!calls.some(c => c.method === 'copyMessage'));
  const cq = { from: { id: 99 }, message: { chat: { id: 99 }, message_id: 55, caption: 'invoice' } };
  await ctx.serverDecide(env, db, cq, order.id, 'a', async () => {});
  assert(calls.some(c => c.method === 'editMessageCaption' && c.payload.reply_markup.inline_keyboard[0][0].callback_data === 'sd:d:1'));
  await ctx.serverDelivery(env, db, adminMsg);
  await ctx.serverDelivery(env, db, { ...adminMsg, message_id: 101, document: undefined, text: 'secret' });
  assert.equal(sql.prepare('SELECT status FROM server_orders').get().status, 'approved');
  assert.equal(calls.filter(c => c.method === 'copyMessage').length, 2);
  assert(calls.some(c => c.method === 'copyMessage' && c.payload.chat_id === '7' && c.payload.message_id === 100));
  await ctx.serverDecide(env, db, cq, order.id, 'd', async () => {});
  assert.equal(sql.prepare('SELECT status FROM server_orders').get().status, 'delivered');
  assert(calls.some(c => c.payload.chat_id === '7' && c.payload.text?.includes('تحویل داده شد')));
  await ctx.serverDecide(env, db, cq, order.id, 'd', async () => {});
  assert.equal(calls.filter(c => c.payload.chat_id === '7' && c.payload.text?.includes('تحویل داده شد')).length, 1);
});
test('unlimited has fixed 30-day tier prices and stale buttons are rejected', async () => {
  const { ctx, sql, env, db } = setup();
  await ctx.serverChoose(env, db, 7, '7', 'unlimited');
  await ctx.serverChooseUsers(env, db, 7, '7', 'bbbbbbbbbbbbbbbb', 2);
  assert.equal(sql.prepare('SELECT stage FROM server_drafts').get().stage, 'users');
  await ctx.serverChooseUsers(env, db, 7, '7', 'aaaaaaaaaaaaaaaa', 2);
  const d = sql.prepare('SELECT * FROM server_drafts').get();
  assert.equal(d.days, 30); assert.equal(d.amount, 287000); assert.equal(d.stage, 'receipt');
});
test('failed receipt notification is recoverable and unauthorized approval is rejected', async () => {
  const { ctx, sql, env, db, msg, setFail } = setup();
  await ctx.serverChoose(env, db, 7, '7', 'open');
  await ctx.serverInput(env, db, msg, '10'); await ctx.serverInput(env, db, msg, '30');
  setFail(true); await ctx.serverReceipt(env, db, msg);
  assert.equal(sql.prepare('SELECT stage FROM server_drafts').get().stage, 'receipt');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM server_orders').get().n, 0);
  setFail(false); await ctx.serverReceipt(env, db, msg);
  await ctx.serverDecide(env, db, { from: { id: 4 } }, 1, 'a', async () => {});
  assert.equal(sql.prepare('SELECT status FROM server_orders').get().status, 'pending');
});
test('closing requires successful delivery and unauthorized replies cannot send files', async () => {
  const { ctx, sql, env, db, msg, calls } = setup();
  await ctx.serverChoose(env, db, 7, '7', 'multi');
  await ctx.serverInput(env, db, msg, '2'); await ctx.serverInput(env, db, msg, '3'); await ctx.serverReceipt(env, db, msg);
  const cq = { from: { id: 99 }, message: { chat: { id: 99 }, message_id: 55 } };
  await ctx.serverDecide(env, db, cq, 1, 'a', async () => {});
  let reason = '';
  await ctx.serverDecide(env, db, cq, 1, 'd', async text => { reason = text; });
  assert.match(reason, /ابتدا/);
  assert.equal(sql.prepare('SELECT status FROM server_orders').get().status, 'approved');
  const result = await ctx.serverDelivery(env, db, { chat: { id: 7 }, from: { id: 7 }, message_id: 9, document: {}, reply_to_message: { message_id: 55 } });
  assert.equal(result, false);
  assert(!calls.some(c => c.method === 'copyMessage'));
});
test('only the selected server description appears with its purchase options', async () => {
  const { ctx, calls, env, db } = setup();
  const products = [
    ['multi', 'امکان حذف تبلیغات یوتیوب', '15000'],
    ['wire', 'ترکیه و 🇩🇪 آلمان', '20000'],
    ['open', 'پینگ پایین و ریجستری بالا', '30000'],
    ['unlimited', 'ترافیک نامحدود', '۳۰ روزه'],
  ];
  for (const [key, detail, price] of products) {
    await ctx.serverChoose(env, db, 7, '7', key);
    const message = calls.at(-1).payload;
    assert(message.text.includes(detail), key);
    assert(message.text.includes(price), key);
    if (key === 'unlimited') assert.equal(message.reply_markup.inline_keyboard.length, 3);
    else assert.match(message.text, /حجم دلخواه/);
  }
});
