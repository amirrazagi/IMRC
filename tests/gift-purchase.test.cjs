const {test}=require('node:test'); const assert=require('node:assert/strict'); const vm=require('node:vm'); const fs=require('node:fs'); const {DatabaseSync}=require('node:sqlite');
const src=fs.readFileSync('worker.js','utf8');
function setup(){
 const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE users(tg_id TEXT PRIMARY KEY); CREATE TABLE bans(tg_id TEXT PRIMARY KEY); CREATE TABLE wallet(tg_id TEXT PRIMARY KEY,balance INTEGER); CREATE TABLE wallet_log(id INTEGER PRIMARY KEY,tg_id TEXT,ts INTEGER,delta INTEGER,reason TEXT);CREATE TABLE subs(tg_id TEXT PRIMARY KEY,until INTEGER); CREATE TABLE gift_drafts(token TEXT PRIMARY KEY,buyer TEXT NOT NULL,recipient TEXT NOT NULL,created INTEGER NOT NULL); CREATE TABLE gift_quotes(token TEXT PRIMARY KEY,draft_token TEXT NOT NULL,buyer TEXT NOT NULL,recipient TEXT NOT NULL,plan TEXT NOT NULL,plan_name TEXT NOT NULL,days INTEGER NOT NULL,amount INTEGER NOT NULL,created INTEGER NOT NULL);CREATE TABLE gifts(token TEXT PRIMARY KEY,draft_token TEXT NOT NULL UNIQUE,buyer TEXT NOT NULL,recipient TEXT NOT NULL,plan TEXT NOT NULL,plan_name TEXT NOT NULL,days INTEGER NOT NULL,amount INTEGER NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,decided INTEGER); INSERT INTO users VALUES('111'),('222'),('333'); INSERT INTO wallet VALUES('111',500000);`);
 let queue=Promise.resolve(); const db={prepare(q){let v=[];return {bind(...x){v=x;return this},async run(){let r=sql.prepare(q).run(...v);return {meta:{changes:Number(r.changes)}}},async first(){return sql.prepare(q).get(...v)||null},async all(){return {results:sql.prepare(q).all(...v)}}}},batch(stmts){queue=queue.then(async()=>{sql.exec('BEGIN');try{const r=[];for(const s of stmts)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}});return queue}};
 let i=0, calls=[];const ctx={Date,Number,PENDING_MS:86400000,fa:n=>String(n),randHex:()=>String(++i).padStart(16,'0'),getSettings:async()=>({plans:[{key:'m',name:'ماهانه',days:30,price:150000}]}),isBanned:async(db,id)=>!!sql.prepare('SELECT 1 FROM bans WHERE tg_id=?').get(id),tg:async(env,method,payload)=>{calls.push(payload);return {ok:true}}};vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('// خرید هدیه اشتراک جدید با کیف پول'),src.indexOf('// سفارش سرور: قیمت‌های فعلی')),ctx);
 return {sql,db,ctx,calls};
}
test('wallet gift pays once per draft and only recipient can accept exactly once',async()=>{
 const {sql,db,ctx}=setup(); await ctx.giftStart({},db,'111','222');const draft=sql.prepare('SELECT * FROM gift_drafts').get();
 await ctx.giftChoose({},db,'111',draft.token,'m');await ctx.giftChoose({},db,'111',draft.token,'m'); const qs=sql.prepare('SELECT * FROM gift_quotes').all();
 await Promise.all(qs.map(q=>ctx.giftPay({},db,'111',q.token)));assert.equal(sql.prepare('SELECT balance FROM wallet').get().balance,350000);assert.equal(sql.prepare('SELECT COUNT(*) n FROM gifts').get().n,1);
 const gift=sql.prepare('SELECT * FROM gifts').get(); await ctx.giftDecide({},db,'333',gift.token,true);assert.equal(sql.prepare('SELECT COUNT(*) n FROM subs').get().n,0);
 await ctx.giftDecide({},db,'222',gift.token,true); const until=sql.prepare('SELECT until FROM subs WHERE tg_id=?').get('222').until;
 await ctx.giftDecide({},db,'222',gift.token,true);await ctx.giftDecide({},db,'222',gift.token,false);assert.equal(sql.prepare('SELECT until FROM subs').get().until,until);assert.equal(sql.prepare('SELECT status FROM gifts').get().status,'accepted');assert.equal(sql.prepare('SELECT balance FROM wallet').get().balance,350000);
});
test('rejection refunds once and recipient existing subscription is never transferred',async()=>{
 const {sql,db,ctx}=setup();sql.prepare('INSERT INTO subs VALUES(?,?)').run('222',Date.now()+1234567);
 await ctx.giftStart({},db,'111','222');await ctx.giftChoose({},db,'111',sql.prepare('SELECT token FROM gift_drafts').get().token,'m');let token=sql.prepare('SELECT token FROM gift_quotes').get().token;await ctx.giftPay({},db,'111',token);
 const before=sql.prepare('SELECT until FROM subs').get().until;await ctx.giftDecide({},db,'222',token,false);await ctx.giftDecide({},db,'222',token,false);
 assert.equal(sql.prepare('SELECT balance FROM wallet').get().balance,500000);assert.equal(sql.prepare('SELECT until FROM subs').get().until,before);assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallet_log').get().n,2);
});
test('expired, insufficient balance, banned or mismatched purchases cannot debit',async()=>{
 const {sql,db,ctx}=setup();await ctx.giftStart({},db,'111','222');await ctx.giftChoose({},db,'111',sql.prepare('SELECT token FROM gift_drafts').get().token,'m');const token=sql.prepare('SELECT token FROM gift_quotes').get().token;
 await ctx.giftPay({},db,'333',token);sql.exec("UPDATE wallet SET balance=1");await ctx.giftPay({},db,'111',token);sql.exec("UPDATE wallet SET balance=500000; INSERT INTO bans VALUES('222')");await ctx.giftPay({},db,'111',token);sql.exec("DELETE FROM bans; UPDATE gift_quotes SET created=0");await ctx.giftPay({},db,'111',token);
 assert.equal(sql.prepare('SELECT balance FROM wallet').get().balance,500000);assert.equal(sql.prepare('SELECT COUNT(*) n FROM gifts').get().n,0);
});
test('only recipient can reject and a banned recipient can still reject for a refund',async()=>{
 const {sql,db,ctx}=setup();await ctx.giftStart({},db,'111','222');await ctx.giftChoose({},db,'111',sql.prepare('SELECT token FROM gift_drafts').get().token,'m');const token=sql.prepare('SELECT token FROM gift_quotes').get().token;await ctx.giftPay({},db,'111',token);sql.exec("INSERT INTO bans VALUES('222')");
 await ctx.giftDecide({},db,'222',token,true);assert.equal(sql.prepare('SELECT status FROM gifts').get().status,'pending');await ctx.giftDecide({},db,'222',token,false);assert.equal(sql.prepare('SELECT status FROM gifts').get().status,'rejected');assert.equal(sql.prepare('SELECT balance FROM wallet').get().balance,500000);
});
