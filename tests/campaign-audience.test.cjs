const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const source=fs.readFileSync('worker.js','utf8'); const c={}; vm.createContext(c); vm.runInContext(source.slice(source.indexOf('function audience('),source.indexOf('async function runBroadcasts')),c);
test('campaign filters new and expiring users and exclude admins and banned accounts',()=>{
 const db=new DatabaseSync(':memory:'); db.exec('CREATE TABLE users(tg_id TEXT,created INTEGER);CREATE TABLE subs(tg_id TEXT,until INTEGER);CREATE TABLE bans(tg_id TEXT)');
 const now=2000000000; const insert=db.prepare('INSERT INTO users VALUES (?,?)'); insert.run('1',now);insert.run('2',now);insert.run('3',now-8*86400000);insert.run('9',now); db.prepare('INSERT INTO bans VALUES (?)').run('2');db.prepare('INSERT INTO subs VALUES (?,?)').run('3',now+86400000);
 function get(target){const x=c.audience(target,now,'9');return db.prepare(`SELECT tg_id FROM users WHERE ${x.sql} ORDER BY tg_id`).all(...x.p).map(r=>r.tg_id)}
 assert.deepEqual(get('new7'),['1']);assert.deepEqual(get('expiring7'),['3']);
});
