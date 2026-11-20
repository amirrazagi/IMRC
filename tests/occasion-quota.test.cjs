const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs'); const vm = require('node:vm');
const source=fs.readFileSync('worker.js','utf8');
function setup(){
  const sql=new DatabaseSync(':memory:'); sql.exec(`CREATE TABLE occasion_quota(id INTEGER PRIMARY KEY CHECK(id=1),bonus INTEGER,starts INTEGER,ends INTEGER); CREATE TABLE subs(tg_id TEXT PRIMARY KEY,until INTEGER); CREATE TABLE user_limits(tg_id TEXT PRIMARY KEY,lim INTEGER,period TEXT,unlock INTEGER,until INTEGER); CREATE TABLE config_log(tg_id TEXT,ts INTEGER,region TEXT);`);
  const db={prepare(q){let args=[];return {bind(...v){args=v;return this},async first(){return sql.prepare(q).get(...args)||null},async run(){const r=sql.prepare(q).run(...args);return {meta:{changes:Number(r.changes)}}}}}};
  const ctx={Date,Number,Request,Response,PERIODS:{day:'day'},periodStartOf:()=>0,getSettings:async()=>({free_limit:1,sub_limit:20,buy_text:'',free_countries:'tr'}),getDB:async()=>db,audit:async()=>{},json:(v,status=200)=>new Response(JSON.stringify(v),{status})}; vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('async function quotaInfo('),source.indexOf('async function me('))+source.slice(source.indexOf('async function adminOccasionQuota('),source.indexOf('async function adminSettings(')),ctx);
  const insert=source.match(/`INSERT INTO config_log\(tg_id,ts,region\)[\s\S]*?`/)[0].slice(1,-1);
  return {sql,db,ctx,insert};
}
function req(body){return new Request('https://example.com/',{method:'POST',body:JSON.stringify(body)})}
test('occasion quota validates settings and counts all usage within the existing period',async()=>{
  const {ctx,db,sql,insert}=setup(), now=Date.now();
  assert.equal((await ctx.adminOccasionQuota(req({bonus:2,starts:now,ends:now}),{})).status,400);
  assert.equal((await ctx.adminOccasionQuota(req({bonus:2,starts:now-1000,ends:now+10000}),{})).status,200);
  const q=await ctx.quotaInfo(db,'123'); assert.equal(q.baseLimit,1);assert.equal(q.bonus,2);assert.equal(q.limit,3);
  const stmt=sql.prepare(insert); const run=()=>stmt.run('123',now,'tr','123',0,q.baseLimit,now,now).changes;
  assert.equal(run(),1);assert.equal(run(),1);assert.equal(run(),1);assert.equal(run(),0);
  assert.equal((await ctx.quotaInfo(db,'123')).remaining,0);
  await ctx.adminOccasionQuota(req({bonus:0,starts:0,ends:0}),{});
  assert.equal(stmt.run('456',now,'tr','456',0,1,now,now).changes,1);
  assert.equal(stmt.run('456',now,'tr','456',0,1,now,now).changes,0);
});
test('inactive windows and custom limits work, and quota update takes effect at insertion',async()=>{
 const {ctx,db,sql,insert}=setup(),now=Date.now();
 sql.prepare('INSERT INTO user_limits VALUES(?,?,?,?,?)').run('123',4,'day',1,null);
 await ctx.adminOccasionQuota(req({bonus:3,starts:now+10000,ends:now+20000}),{});
 let q=await ctx.quotaInfo(db,'123'); assert.equal(q.limit,4);assert.equal(q.bonus,0);
 await ctx.adminOccasionQuota(req({bonus:3,starts:now-1000,ends:now+10000}),{});
 q=await ctx.quotaInfo(db,'123');assert.equal(q.limit,7);
 sql.exec("INSERT INTO config_log VALUES('123',1,'tr'),('123',2,'tr'),('123',3,'tr'),('123',4,'tr')");
 await ctx.adminOccasionQuota(req({bonus:0,starts:0,ends:0}),{});
 assert.equal(sql.prepare(insert).run('123',now,'tr','123',0,q.baseLimit,now,now).changes,0);
});
test('occasion quota endpoint is behind admin authorization',()=>assert.match(source,/p === "\/api\/admin\/occasion-quota"[^\n]*adminAuth\(request, env\)/));
