const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

function setup() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE server_drafts(tg_id TEXT PRIMARY KEY, token TEXT, product TEXT, stage TEXT, volume INTEGER, days INTEGER, users INTEGER, amount INTEGER, created INTEGER);
    CREATE TABLE server_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,tg_id TEXT,product TEXT,volume INTEGER,days INTEGER,users INTEGER,amount INTEGER,file_id TEXT,status TEXT,created INTEGER,admin_msg_id INTEGER,decided INTEGER,decided_by TEXT,payment_token TEXT);
    CREATE TABLE server_deliveries(order_id INTEGER,source_chat TEXT,source_message INTEGER,created INTEGER, PRIMARY KEY(source_chat,source_message));
    CREATE TABLE wallet_quotes(token TEXT PRIMARY KEY,tg_id TEXT,kind TEXT,amount INTEGER,plan TEXT,days INTEGER,code TEXT,percent INTEGER,pending_ts INTEGER,created INTEGER);
    CREATE TABLE wallet_payments(token TEXT PRIMARY KEY,tg_id TEXT,kind TEXT,amount INTEGER,status TEXT,created INTEGER);
    CREATE TABLE wallet(tg_id TEXT PRIMARY KEY,balance INTEGER); CREATE TABLE wallet_log(tg_id TEXT,ts INTEGER,delta INTEGER,reason TEXT);
    CREATE TABLE subs(tg_id TEXT PRIMARY KEY,until INTEGER); CREATE TABLE discount_codes(code TEXT PRIMARY KEY,active INTEGER,percent INTEGER,expires INTEGER,max_uses INTEGER,used INTEGER);
    CREATE TABLE pending_buy(tg_id TEXT PRIMARY KEY,plan TEXT,code TEXT,ts INTEGER); CREATE TABLE bot_state(tg_id TEXT PRIMARY KEY, awaiting TEXT);`);
  const db = { prepare(query) { let values = []; return { bind(...v) { values = v; return this; }, async run() { const r = sql.prepare(query).run(...values); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, async first() { return sql.prepare(query).get(...values) || null; } }; }, async batch(stmts) { sql.exec('BEGIN'); try { const results = []; for (const stmt of stmts) results.push(await stmt.run()); sql.exec('COMMIT'); return results; } catch(e) { sql.exec('ROLLBACK'); throw e; } } };
  const calls = [];
  let failPhoto = false;
  const ctx = { console, db, calls, walletBalance: async (db, id) => sql.prepare('SELECT balance FROM wallet WHERE tg_id=?').get(id)?.balance || 0, fa: n => String(n), randHex: () => 'a'.repeat(16), isBanned: async () => false, adminTgId: env => env.ADMIN_TG_ID, isAdmin: (env, id) => String(id) === env.ADMIN_TG_ID, getSettings: async () => ({ pay_text: 'CARD' }), stampReceipt: async () => {}, tg: async (env, method, payload) => { calls.push({ method, payload }); return method === 'sendPhoto' ? (failPhoto ? { ok: false } : { ok: true, result: { message_id: 55 } }) : { ok: true }; } };
  vm.createContext(ctx);
  const source = fs.readFileSync('worker.js', 'utf8');
  vm.runInContext(source.slice(source.indexOf('// سفارش سرور:'), source.indexOf('// ===== کیف پول:')) + source.slice(source.indexOf('// همه تغییرات مالی'), source.indexOf('// پرداخت اشتراک فقط')), ctx);
  ctx.PENDING_MS = 86400000;
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
test('wallet server purchase is atomic, full-only and repeat safe', async () => {
  const { ctx, sql, env, db, msg } = setup();
  await ctx.serverChoose(env, db, 7, '7', 'multi');
  await ctx.serverInput(env, db, msg, '2'); await ctx.serverInput(env, db, msg, '10');
  sql.prepare('INSERT INTO wallet VALUES (?,?)').run('7', 29999);
  await ctx.payWallet(env, db, 7, '7', 'aaaaaaaaaaaaaaaa');
  assert.equal(sql.prepare('SELECT balance FROM wallet').get().balance, 29999);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM server_orders').get().n, 0);
  sql.prepare('UPDATE wallet SET balance=50000').run();
  await ctx.payWallet(env, db, 7, '7', 'aaaaaaaaaaaaaaaa');
  await ctx.payWallet(env, db, 7, '7', 'aaaaaaaaaaaaaaaa');
  assert.equal(sql.prepare('SELECT balance FROM wallet').get().balance, 20000);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM server_orders').get().n, 1);
  assert.equal(sql.prepare('SELECT status FROM server_orders').get().status, 'approved');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_log').get().n, 1);
});
test('wallet subscription applies valid discount once and extends subscription atomically', async () => {
  const { ctx, sql, env, db } = setup(); const now = Date.now();
  sql.prepare('INSERT INTO wallet VALUES (?,?)').run('7', 50000);
  sql.prepare('INSERT INTO pending_buy VALUES (?,?,?,?)').run('7', 'm', 'CODE', now);
  sql.prepare('INSERT INTO discount_codes VALUES (?,?,?,?,?,?)').run('CODE', 1, 20, 0, 1, 0);
  sql.prepare('INSERT INTO wallet_quotes VALUES (?,?,?,?,?,?,?,?,?,?)').run('0123456789abcdef', '7', 'sub', 40000, 'm', 30, 'CODE', 20, now, now);
  await ctx.payWallet(env, db, 7, '7', '0123456789abcdef');
  const until = sql.prepare('SELECT until FROM subs').get().until;
  await ctx.payWallet(env, db, 7, '7', '0123456789abcdef');
  assert.equal(sql.prepare('SELECT balance FROM wallet').get().balance, 10000);
  assert.equal(sql.prepare('SELECT until FROM subs').get().until, until);
  assert.equal(sql.prepare('SELECT used FROM discount_codes').get().used, 1);
});
test('wallet server purchase notifies admin and delivers files using invoice reply', async () => {
  const { ctx, sql, env, db, msg, calls } = setup();
  ctx.tg = async (e, method, payload) => { calls.push({ method, payload }); return { ok: true, result: { message_id: 88 } }; };
  await ctx.serverChoose(env, db, 7, '7', 'multi'); await ctx.serverInput(env, db, msg, '1'); await ctx.serverInput(env, db, msg, '5');
  sql.prepare('INSERT INTO wallet VALUES (?,?)').run('7', 15000);
  await ctx.payWallet(env, db, 7, '7', 'aaaaaaaaaaaaaaaa');
  assert.equal(sql.prepare('SELECT admin_msg_id FROM server_orders').get().admin_msg_id, 88);
  await ctx.serverDelivery(env, db, { chat: { id: 99 }, from: { id: 99 }, message_id: 102, document: { file_id: 'cfg' }, reply_to_message: { message_id: 88 } });
  assert(calls.some(x => x.method === 'copyMessage' && x.payload.chat_id === '7'));
});
test('expired discount and other user cannot pay a quote', async () => {
  const { ctx, sql, env, db } = setup(); const now = Date.now();
  sql.prepare('INSERT INTO wallet VALUES (?,?)').run('7', 100000);
  sql.prepare('INSERT INTO pending_buy VALUES (?,?,?,?)').run('7', 'm', 'BAD', now);
  sql.prepare('INSERT INTO discount_codes VALUES (?,?,?,?,?,?)').run('BAD', 1, 20, now - 1, 1, 0);
  sql.prepare('INSERT INTO wallet_quotes VALUES (?,?,?,?,?,?,?,?,?,?)').run('0123456789abcdef', '7', 'sub', 40000, 'm', 30, 'BAD', 20, now, now);
  await ctx.payWallet(env, db, 8, '8', '0123456789abcdef');
  await ctx.payWallet(env, db, 7, '7', '0123456789abcdef');
  assert.equal(sql.prepare('SELECT balance FROM wallet').get().balance, 100000);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_payments').get().n, 0);
});
