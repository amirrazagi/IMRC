const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('worker.js', 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
function setup() {
  const calls = [];
  const context = { calls, tg: async (env, method, payload) => { calls.push({ method, payload }); return { ok: true }; }, adminTgId: env => String(env.ADMIN_TG_ID).trim(), HIDE_KB: { remove_keyboard: true }, WELCOME: 'welcome' };
  vm.createContext(context);
  vm.runInContext(section('const USER_COMMANDS =', 'const SUPPORT_HELP') + section('const PANEL_URL =', '// پروفایل ربات:'), context);
  return context;
}
test('menu uses inline buttons, default panel link, and admin-only controls', async () => {
  const ctx = setup();
  await ctx.sendMainMenu({}, {}, 1, false, 'hello');
  assert.equal(ctx.calls[0].payload.reply_markup.remove_keyboard, true);
  const rows = ctx.calls[1].payload.reply_markup.inline_keyboard;
  assert.equal(rows[0][0].callback_data, 'menu:server');
  assert.equal(rows[2][0].url, 'https://imrc.adgjl1113337u79.workers.dev');
  assert(!rows.flat().some(b => b.callback_data === 'menu:admin'));
  ctx.calls.length = 0;
  await ctx.sendMainMenu({ PUBLIC_URL: 'https://example.com/' }, {}, 1, true, 'hello');
  const adminRows = ctx.calls[1].payload.reply_markup.inline_keyboard;
  assert.equal(adminRows[2][0].url, 'https://example.com');
  assert(adminRows.flat().some(b => b.callback_data === 'menu:admin'));
});
test('command registration replaces both default and admin scopes with start only', async () => {
  const ctx = setup();
  assert.equal(await ctx.syncBotCommands({ ADMIN_TG_ID: ' 123 ' }), true);
  assert.equal(ctx.calls.length, 2);
  for (const call of ctx.calls) assert.deepEqual(Array.from(call.payload.commands, x => x.command), ['start']);
  assert.equal(ctx.calls[1].payload.scope.chat_id, '123');
});
