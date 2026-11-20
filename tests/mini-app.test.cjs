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

test('mini app data stays scoped to signed user and file resend checks ownership', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE server_orders(id INTEGER PRIMARY KEY,tg_id TEXT,product TEXT,volume INTEGER,days INTEGER,users INTEGER,amount INTEGER,status TEXT,created INTEGER,decided INTEGER,delivered_at INTEGER,payment_token TEXT);
    CREATE TABLE server_deliveries(order_id INTEGER,source_chat TEXT,source_message INTEGER,created INTEGER,kind TEXT,file_name TEXT,file_id TEXT);
    CREATE TABLE wallet_log(id INTEGER PRIMARY KEY,tg_id TEXT,ts INTEGER,delta INTEGER,reason TEXT);
    CREATE TABLE tickets(id INTEGER PRIMARY KEY,tg_id TEXT,status TEXT,category TEXT);
    CREATE TABLE ticket_msgs(id INTEGER PRIMARY KEY,ticket_id INTEGER,sender TEXT,text TEXT,ts INTEGER);`);
  sql.exec("INSERT INTO server_orders VALUES(1,'123','multi',5,30,NULL,75000,'delivered',1,NULL,NULL,NULL),(2,'999','wire',5,30,NULL,100000,'delivered',1,NULL,NULL,NULL); INSERT INTO server_deliveries VALUES(1,'42',11,1,'document','a.conf','file-a'),(2,'42',22,1,'document','b.conf','file-b'); INSERT INTO wallet_log VALUES(1,'123',1,-75000,'server'),(2,'999',1,90000,'private'); INSERT INTO tickets VALUES(1,'123','open','general'),(2,'999','open','general'); INSERT INTO ticket_msgs VALUES(1,1,'admin','hello',1),(2,2,'admin','private',1);");
  const db = { prepare(q) { let args=[]; return { bind(...a) { args=a; return this; }, async first(){ return sql.prepare(q).get(...args) || null; }, async all(){ return { results: sql.prepare(q).all(...args) }; } }; } };
  const { context } = setup(); context.getDB = async () => db; context.SERVER_PRODUCTS = { multi: { name: 'multi' }, wire: { name: 'wire' } };
  const copied = []; context.tg = async (env, method, payload) => { copied.push(payload); return { ok: true }; };
  const initData = signed({ auth_date: now(), user: '{"id":123}' }), env = { BOT_TOKEN: 'test:token' };
  let r = await context.miniApi(request({ initData, action: 'orders' }), env); let data = await r.json();
  assert.equal(data.orders.length, 1); assert.equal(data.orders[0].files.length, 1); assert.equal(data.orders[0].files[0].file_name, 'a.conf');
  r = await context.miniApi(request({ initData, action: 'wallet_history' }), env); data = await r.json(); assert.equal(data.transactions.length, 1); assert.equal(data.transactions[0].reason, 'server');
  r = await context.miniApi(request({ initData, action: 'tickets' }), env); data = await r.json(); assert.equal(data.messages.length, 1); assert.equal(data.messages[0].text, 'hello');
  r = await context.miniApi(request({ initData, action: 'delivery_resend', order_id: 2, message_id: 22 }), env); assert.equal(r.status, 404); assert.equal(copied.length, 0);
  r = await context.miniApi(request({ initData, action: 'delivery_resend', order_id: 1, message_id: 11 }), env); assert.equal(r.status, 200); assert.equal(copied[0].chat_id, '123');
});
test('mini config creation uses validated identity and the shared policy engine', async () => {
  const { context } = setup();
  context.BOT_COUNTRIES = [{ code: 'tr' }]; context.BOT_MODES = { ranked: 'ranked' }; context.BOT_ROLES = { attacker: 'attacker' }; context.BOT_DNS = [{ v: '' }];
  let who; context.issueConfig = async (env, sess, body) => { who = sess.tg_id; return { status: 403, body: { error: 'premium', message: 'restricted' } }; };
  const initData = signed({ auth_date: now(), user: '{"id":123}' });
  let r = await context.miniApi(request({ initData, action: 'config_create', config: { region: 'tr', mode: 'ranked', role: 'attacker', dns: '', mtu: '1280' }, user_id: 999 }), { BOT_TOKEN: 'test:token' });
  assert.equal(r.status, 403); assert.equal(who, '123'); assert.equal((await r.json()).message, 'restricted');
  r = await context.miniApi(request({ initData, action: 'config_create', config: { region: 'xx', mode: 'ranked', role: 'attacker', dns: '', mtu: '' } }), { BOT_TOKEN: 'test:token' }); assert.equal(r.status, 400);
});
test('mini support stores ticket and links admin notification for replies', async () => {
  const { DatabaseSync } = require('node:sqlite'); const sql = new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE tickets(id INTEGER PRIMARY KEY AUTOINCREMENT,tg_id TEXT,name TEXT,username TEXT,status TEXT,created INTEGER,updated INTEGER,category TEXT);
    CREATE TABLE ticket_msgs(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id INTEGER,sender TEXT,text TEXT,ts INTEGER,admin_msg_id INTEGER);`);
  const db = { prepare(q) { let args=[]; return { bind(...a) { args=a; return this; }, async first(){ return sql.prepare(q).get(...args) || null; }, async run(){ const r=sql.prepare(q).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; } };
  const { context } = setup(); context.getDB = async () => db; context.adminTgId = env => env.ADMIN_TG_ID; context.TICKET_RATE = { win: 600000, max: 5 };
  context.tg = async () => ({ ok: true, result: { message_id: 55 } });
  const initData = signed({ auth_date: now(), user: '{"id":123,"first_name":"Ali"}' });
  let r = await context.miniApi(request({ initData, action: 'ticket_send', text: 'سلام', category: 'payment' }), { BOT_TOKEN: 'test:token', ADMIN_TG_ID: '42' });
  assert.equal(r.status, 200); assert.equal((await r.json()).notified, true);
  assert.equal(sql.prepare('SELECT tg_id FROM tickets').get().tg_id, '123'); assert.equal(sql.prepare('SELECT category FROM tickets').get().category, 'payment');
  const msg = sql.prepare('SELECT * FROM ticket_msgs').get(); assert.equal(msg.text, 'سلام'); assert.equal(msg.admin_msg_id, 55);
  r = await context.miniApi(request({ initData, action: 'ticket_send', text: '  ' }), { BOT_TOKEN: 'test:token', ADMIN_TG_ID: '42' }); assert.equal(r.status, 400);
});
test('file download errors do not leak bot token or expose another user file', async () => {
  const { context } = setup();
  context.getDB = async () => ({ prepare: () => ({ bind() { return this; }, async first() { return { source_chat:'42', source_message:11, kind:'document', file_id:'test', file_name:'file.conf' }; } }) });
  context.tg = async () => ({ ok:true, result:{file_path:'documents/example.conf',file_size:123} });
  context.fetch = async () => { throw Error('URL contains secret token'); };
  const initData = signed({ auth_date: now(), user: '{"id":123}' });
  const r = await context.miniApi(request({ initData, action:'delivery_file', order_id:1, message_id:11 }), { BOT_TOKEN:'test:token' });
  assert.equal(r.status, 502); assert(!JSON.stringify(await r.json()).includes('token'));
});
test('owned delivery file is returned as a private attachment without exposing token', async () => {
  const { context } = setup();
  context.getDB = async () => ({ prepare: () => ({ bind() { return this; }, async first() { return { source_chat:'42', source_message:11, kind:'document', file_id:'test', file_name:'profile.conf' }; } }) });
  context.tg = async () => ({ ok:true, result:{file_path:'documents/example.conf',file_size:5} });
  let fetched; context.fetch = async url => { fetched = url; return new Response('hello', { status:200 }); };
  const initData = signed({ auth_date: now(), user: '{"id":123}' });
  const r = await context.miniApi(request({ initData, action:'delivery_file', order_id:1, message_id:11 }), { BOT_TOKEN:'test:token' });
  assert.equal(r.status, 200); assert(fetched.startsWith('https://api.telegram.org/file/bot'));
  assert.equal(await r.text(), 'hello'); assert.match(r.headers.get('content-disposition'), /profile\.conf/);
  assert.equal(r.headers.get('cache-control'), 'no-store'); assert(![...r.headers].some(([, value]) => value.includes('test:token')));
});
test('configuration presets are per user and store settings only, not generated secrets', async () => {
  const { DatabaseSync } = require('node:sqlite'); const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE mini_config_presets(tg_id TEXT PRIMARY KEY, config TEXT, updated INTEGER)');
  const db = { prepare(q) { let args=[]; return { bind(...a) { args=a; return this; }, async first(){ return sql.prepare(q).get(...args)||null; }, async run(){const r=sql.prepare(q).run(...args);return {meta:{changes:Number(r.changes)}};} }; } };
  const { context } = setup(); context.getDB = async () => db; context.BOT_COUNTRIES = [{code:'tr'}]; context.BOT_MODES = {ranked:'ranked'}; context.BOT_ROLES = {attacker:'attacker'}; context.BOT_DNS = [{v:''}];
  const one = signed({auth_date:now(),user:'{"id":123}'}), two = signed({auth_date:now(),user:'{"id":999}'}), env = { BOT_TOKEN:'test:token' };
  let r = await context.miniApi(request({ initData:one, action:'config_preset_save', config:{region:'tr',mode:'ranked',role:'attacker',dns:'',mtu:'1280',name:'mine',config:'SECRET'} }),env);
  assert.equal(r.status,200); assert(!sql.prepare('SELECT config FROM mini_config_presets').get().config.includes('SECRET'));
  r = await context.miniApi(request({initData:two,action:'config_preset_get'}),env); assert.equal((await r.json()).config,null);
  r = await context.miniApi(request({initData:one,action:'config_preset_get'}),env); assert.equal((await r.json()).config.name,'mine');
});
test('manual location status is labeled via stored entries', async () => {
  const { context } = setup(); context.BOT_COUNTRIES=[{code:'tr',name:'ترکیه'}];
  context.getDB=async()=>({prepare:()=>({async all(){return {results:[{code:'tr',level:'down',note:'بررسی',updated:123}]};}})});
  const r=await context.miniApi(request({initData:signed({auth_date:now(),user:'{"id":123}'}),action:'locations'}),{BOT_TOKEN:'test:token'});
  assert.equal(r.status,200); const data=await r.json(); assert.equal(data.locations[0].name,'ترکیه'); assert.equal(data.locations[0].level,'down');
});
test('game profiles are isolated per user, limited to ten, and never store arbitrary private data', async () => {
  const { DatabaseSync } = require('node:sqlite'); const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE game_profiles(tg_id TEXT,name TEXT,config TEXT,updated INTEGER,PRIMARY KEY(tg_id,name))');
  const db = { prepare(q) { let args=[]; return { bind(...a){args=a;return this}, async all(){return {results:sql.prepare(q).all(...args)}}, async run(){const r=sql.prepare(q).run(...args);return {meta:{changes:Number(r.changes)}}} }; } };
  const { context }=setup();context.getDB=async()=>db;context.BOT_COUNTRIES=[{code:'tr'}];context.BOT_MODES={ranked:'R'};context.BOT_ROLES={attacker:'A'};context.BOT_DNS=[{v:''}];
  const one=signed({auth_date:now(),user:'{"id":123}'}),two=signed({auth_date:now(),user:'{"id":999}'}),env={BOT_TOKEN:'test:token'},config={region:'tr',mode:'ranked',role:'attacker',dns:'',mtu:'1280',name:'test',secret:'NO'};
  for(let i=0;i<10;i++){const r=await context.miniApi(request({initData:one,action:'game_profile_save',name:'game'+i,config}),env);assert.equal(r.status,200)}
  assert.equal((await context.miniApi(request({initData:one,action:'game_profile_save',name:'extra',config}),env)).status,400);
  assert.equal((await (await context.miniApi(request({initData:two,action:'game_profiles'}),env)).json()).profiles.length,0);
  assert(!sql.prepare('SELECT config FROM game_profiles LIMIT 1').get().config.includes('NO'));
  await context.miniApi(request({initData:two,action:'game_profile_delete',name:'game0'}),env);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM game_profiles').get().n,10);
});
test('reminder choices reject invalid days and are scoped to the signed user', async () => {
  const { context }=setup(); const rows=new Map();
  context.getSettings=async()=>({remind_days:3});
  context.getDB=async()=>({prepare:()=>({bind(...args){this.args=args;return this},async first(){const value=rows.get(this.args[0]);return value===undefined?null:{days:value}},async run(){rows.set(this.args[0],this.args[1]);return {meta:{changes:1}}}})});
  const one=signed({auth_date:now(),user:'{"id":123}'}),two=signed({auth_date:now(),user:'{"id":999}'}),env={BOT_TOKEN:'test:token'};
  assert.equal((await context.miniApi(request({initData:one,action:'reminder_save',days:31}),env)).status,400);
  assert.equal((await context.miniApi(request({initData:one,action:'reminder_save',days:0}),env)).status,200);
  assert.equal((await (await context.miniApi(request({initData:one,action:'reminder_get'}),env)).json()).days,0);
  assert.equal((await (await context.miniApi(request({initData:two,action:'reminder_get'}),env)).json()).days,3);
});
