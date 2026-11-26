const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/panel.js', 'utf8');
const worker = fs.readFileSync('worker.js', 'utf8');

test('CODM tools page, navigation and quick commands are fully removed from the panel', () => {
  assert.equal(html.includes('page-codm'), false);
  assert.equal(html.includes('ابزارهای کالاف'), false);
  assert.equal(html.includes('data-page="codm"'), false);
  assert.equal(js.includes('codmOptimize'), false);
  assert.equal(js.includes('go("codm")'), false);
  assert.equal(js.includes('ttkDmg'), false);
  assert.equal(js.includes('IMRC_matches'), false);
  assert.match(js, /home: "خانه", build: "ساخت کانفیگ", tools: "ابزارهای کمکی"/);
});

test('build config is the primary action: hero card, sidebar CTA and mobile button', () => {
  assert.match(html, /class="build-hero"/);
  assert.match(html, /id="buildHeroTitle"/);
  assert.match(html, /class="nav-i nav-cta magnetic" data-page="build"/);
  assert.match(html, /class="bottom-build magnetic" data-page="build"/);
  assert.match(html, /data-act="wizOpen"/);
  assert.match(fs.readFileSync('public/panel.css', 'utf8'), /\.nav-i\.nav-cta/);
  assert.match(fs.readFileSync('public/panel.css', 'utf8'), /\.build-hero-btn/);
});

test('wizard walks server, settings and confirm steps and builds at the end', () => {
  for (const id of ['wizDlg', 'wizStep1', 'wizStep2', 'wizStep3', 'wizBar', 'wizSrv', 'wizNext', 'wizBack']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(js, /function openWizard\(\)/);
  assert.match(js, /function wizGo\(n\)/);
  assert.match(js, /wiz.step === 3 \? "ساخت و دانلود فایل"/);
  assert.match(js, /wizNextAction[\s\S]{0,120}closeWizard\(\);[\s\S]{0,40}build\(\);/);
  assert.match(js, /function wizPick[\s\S]{0,400}isLocked\(c\)/);
  assert.match(js, /wizOpen: \(\) => openWizard\(\)/);
});

test('service incident banner shows active incidents and lets users subscribe to alerts', () => {
  assert.match(html, /id="incidentBanner"/);
  assert.match(html, /id="incidentPush"[^>]*data-act="push"|data-act="push"[^>]*id="incidentPush"/);
  assert.match(js, /function renderIncident\(d\)/);
  assert.match(js, /renderIncident\(d\);/);
  assert.match(js, /store\.get\("IMRC_inc_hidden"/);
  assert.match(js, /incidentHide: \(\) => incidentHide\(\)/);
});

test('API status reports the active incident and its level affects the overall state', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec("CREATE TABLE settings(k TEXT PRIMARY KEY, v TEXT); CREATE TABLE incidents(id INTEGER PRIMARY KEY,title TEXT,level TEXT,body TEXT,started INTEGER,resolved INTEGER);");
  sql.prepare("INSERT INTO settings VALUES('cron_ts',?)").run(String(Date.now()));
  sql.prepare("INSERT INTO incidents VALUES(1,'کندی شبکه','degraded','بررسی در جریان است',?,NULL)").run(Date.now());
  const db = { prepare(q) { let v = []; return { bind(...x) { v = x; return this; }, async first() { return sql.prepare(q).get(...v) || null; }, async run() { return { meta: { changes: 1 } }; } }; } };
  const ctx = { Date, getDB: async () => db, getSettings: async () => ({ status_level: 'ok', status_note: '' }) };
  vm.createContext(ctx);
  const source = worker.slice(worker.indexOf('const HEARTBEAT_MAX_AGE'), worker.indexOf('async function statusHistory'));
  vm.runInContext(source, ctx);
  const status = await ctx.serviceStatus({});
  assert.equal(status.incident.title, 'کندی شبکه');
  assert.equal(status.incident.level, 'degraded');
  assert.equal(status.overall, 'degraded');
  sql.prepare("UPDATE incidents SET resolved=?").run(Date.now());
  const after = await ctx.serviceStatus({});
  assert.equal(after.incident, null);
  assert.equal(after.overall, 'ok');
});

test('creating and resolving an incident notifies every subscribed device', () => {
  assert.match(worker, /async function pushAll\(env, db, payload\)/);
  assert.match(worker, /incident_create[\s\S]{0,400}pushAll\(env, db, \{ title:/);
  assert.match(worker, /incident_resolve[\s\S]{0,300}pushAll\(env, db, \{ title: "🟢/);
});
