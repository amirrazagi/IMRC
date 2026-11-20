const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('worker.js','utf8');
const snippet = source.slice(source.indexOf('async function sendDirectUserMessage'), source.indexOf('// GET /api/admin/tg/auto'));
test('direct messages validate recipient, send exactly the requested text and audit without message content', async () => {
  const calls = [], audits = [];
  const db = { prepare: () => ({ bind(id) { this.id = id; return this; }, async first() { return this.id === '123' ? { tg_id: '123' } : null; } }) };
  const ctx = { rateOk: async () => true, audit: async (...a) => audits.push(a), tg: async (env, method, body) => { calls.push(body); return { ok: true }; } };
  vm.createContext(ctx); vm.runInContext(snippet, ctx);
  assert.equal((await ctx.sendDirectUserMessage({ BOT_TOKEN:'secret' }, db, '123', 'سلام خصوصی', 'admin')).ok, true);
  assert.equal(calls[0].text, 'سلام خصوصی'); assert(!JSON.stringify(audits).includes('سلام خصوصی'));
  assert.equal((await ctx.sendDirectUserMessage({ BOT_TOKEN:'secret' }, db, '999', 'hello', 'admin')).ok, false);
  assert.equal((await ctx.sendDirectUserMessage({ BOT_TOKEN:'secret' }, db, '123', 'a'.repeat(3501), 'admin')).ok, false);
  assert.equal(calls.length, 1);
  ctx.tg = async () => ({ ok:false });
  assert.equal((await ctx.sendDirectUserMessage({ BOT_TOKEN:'secret' }, db, '123', 'hello', 'admin')).ok, false);
  assert.equal(audits.at(-1)[2], 'direct_message_failed');
});
test('admin-only authorization protects private-message endpoint and bot command', () => {
  assert.match(source, /p === "\/api\/admin\/direct-message"[^\n]+adminAuth\(request, env\)/);
  assert.match(source, /if \(m\) \{\s*if \(!isAdmin\(env, from\.id\)\) return reply\(NOT_ADMIN\);\s*const result = await sendDirectUserMessage/);
});
