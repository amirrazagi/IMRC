const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto, createHmac } = require('node:crypto');
const source = fs.readFileSync('worker.js', 'utf8');
const js = source.slice(source.indexOf('async function verifyMiniInitData'), source.indexOf('/* ---------------- /api/auth/*'));
function signed(values, token = 'test:token') {
  const params = new URLSearchParams(values);
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
function setup() {
  let blocked = false, fail = false; const calls = [];
  const context = {
    URLSearchParams, TextEncoder, Uint8Array, crypto: webcrypto, Date, Number, String, Set, JSON, Request, Response, console,
    json: (data, status = 200) => new Response(JSON.stringify(data), { status }),
    getDB: async () => ({ prepare: () => ({ bind() { return this; }, async run() {} }) }),
    isBanned: async () => blocked, rateOk: async () => true,
    quotaInfo: async () => ({ sub: false, sub_until: null, remaining: 1, limit: 1, period: 'day' }),
    walletBalance: async () => 50000,
    sendServerShop: async (env, id) => { calls.push(id); return fail ? { ok: false } : { ok: true }; },
  };
  vm.createContext(context); vm.runInContext(js, context);
  return { context, calls, block: () => { blocked = true; }, fail: () => { fail = true; } };
}
const now = () => String(Math.floor(Date.now() / 1000));
const request = body => new Request('https://example.com/api/mini', { method: 'POST', body: JSON.stringify(body) });
test('validates Telegram signatures, freshness, and duplicate parameters', async () => {
  const { context } = setup(), original = signed({ auth_date: now(), user: JSON.stringify({ id: 123, first_name: 'Ali' }), query_id: 'hello' });
  assert.equal((await context.verifyMiniInitData(original, 'test:token')).id, 123);
  assert.equal(await context.verifyMiniInitData(original.replace('Ali', 'Bob'), 'test:token'), null);
  assert.equal(await context.verifyMiniInitData(original + '&auth_date=' + now(), 'test:token'), null);
  assert.equal(await context.verifyMiniInitData(original, 'wrong'), null);
  assert.equal(await context.verifyMiniInitData(signed({ auth_date: String(Math.floor(Date.now()/1000)-86401), user: '{"id":123}' }), 'test:token'), null);
  assert.equal(await context.verifyMiniInitData(signed({ auth_date: now(), user: '{"id":123,"is_bot":true}' }), 'test:token'), null);
});
test('API uses only signed user, denies invalid or banned identities, and reports failed delivery', async () => {
  const { context, calls, block, fail } = setup();
  const initData = signed({ auth_date: now(), user: '{"id":123,"first_name":"Ali"}' });
  const env = { BOT_TOKEN: 'test:token' };
  let response = await context.miniApi(request({ initData, action: 'summary', user_id: 999 }), env);
  assert.equal(response.status, 200); assert.equal((await response.json()).balance, 50000);
  response = await context.miniApi(request({ initData, action: 'server', user_id: 999 }), env);
  assert.equal(response.status, 200); assert.equal(calls[0], '123');
  fail(); response = await context.miniApi(request({ initData, action: 'server' }), env); assert.equal(response.status, 502);
  response = await context.miniApi(request({ initData: 'user=999', action: 'server' }), env); assert.equal(response.status, 401);
  response = await context.miniApi(request({ initData, action: 'admin' }), env); assert.equal(response.status, 400);
  block(); response = await context.miniApi(request({ initData, action: 'summary' }), env); assert.equal(response.status, 403);
});
