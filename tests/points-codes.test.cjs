const {test}=require('node:test'); const assert=require('node:assert/strict'); const vm=require('node:vm'); const fs=require('node:fs'); const {DatabaseSync}=require('node:sqlite');
const src=fs.readFileSync('worker.js','utf8');
const schema=`CREATE TABLE discount_codes(code TEXT PRIMARY KEY,percent INTEGER,max_uses INTEGER,used INTEGER,expires INTEGER,active INTEGER,created INTEGER);
 CREATE TABLE personal_codes(code TEXT PRIMARY KEY,tg_id TEXT,percent INTEGER,max_uses INTEGER,used INTEGER,expires INTEGER,min_amount INTEGER,active INTEGER,created INTEGER);
 CREATE TABLE pending_buy(tg_id TEXT PRIMARY KEY,plan TEXT,code TEXT,ts INTEGER,use_wallet INTEGER DEFAULT 0,topup INTEGER DEFAULT 0);
 CREATE TABLE points(tg_id TEXT PRIMARY KEY,balance INTEGER NOT NULL DEFAULT 0); CREATE TABLE points_log(id INTEGER PRIMARY KEY AUTOINCREMENT,tg_id TEXT,ts INTEGER,delta INTEGER,reason TEXT);
 CREATE TABLE points_redeems(token TEXT PRIMARY KEY,tg_id TEXT,points INTEGER,amount INTEGER,status TEXT,created INTEGER);
 CREATE TABLE wallet(tg_id TEXT PRIMARY KEY,balance INTEGER); CREATE TABLE wallet_log(id INTEGER PRIMARY KEY AUTOINCREMENT,tg_id TEXT,ts INTEGER,delta INTEGER,reason TEXT);`;
function setup(settings={}){
 const sql=new DatabaseSync(':memory:');sql.exec(schema);let queue=Promise.resolve();
 const db={prepare(q){let v=[];return{bind(...x){v=x;return this},async run(){const r=sql.prepare(q).run(...v);return{meta:{changes:Number(r.changes)}}},async first(){return sql.prepare(q).get(...v)||null},async all(){return{results:sql.prepare(q).all(...v)}}}},batch(stmts){queue=queue.then(async()=>{sql.exec('BEGIN');try{const r=[];for(const st of stmts)r.push(await st.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}});return queue}};
 let i=0;const calls=[];const ctx={Date,Number,PENDING_MS:86400000,fa:n=>String(n),randHex:()=>String(++i).padStart(16,'0'),clean:(v,n)=>String(v).slice(0,n),tg:async(e,m,p)=>{calls.push(p);return{ok:true}},walletBalance:async(db,id)=>{const r=sql.prepare('SELECT balance FROM wallet WHERE tg_id=?').get(String(id));return r?r.balance:0},
  getSettings:async()=>({points_enabled:false,points_rate:0,points_value:1,points_invite:0,points_min:100,...settings})};
 vm.createContext(ctx);
 vm.runInContext(src.slice(src.indexOf('async function activeCode('),src.indexOf('async function choosePlan('))+src.slice(src.indexOf('// باشگاه امتیاز'),src.indexOf('// خرید هدیه اشتراک')),ctx);
 const api=vm.runInContext('({activeCode,codeApplies,priceAfter,pendingCode,pointsAdd,pointsBalance,pointsAward,sendPoints,pointsRedeem})',ctx);
 return {sql,ctx,api,calls,db};
}
const plan={key:'m',name:'ماهانه',days:30,price:150000};
test('personal discount codes work only for their owner and respect expiry, cap and minimum amount',async()=>{
 const {sql,api}=setup();const now=Date.now();
 sql.prepare('INSERT INTO personal_codes VALUES(?,?,?,?,0,?,?,1,?)').run('ALI20','111',20,1,now+86400000,100000,now);
 const db={prepare:q=>{let v=[];return{bind(...x){v=x;return this},async first(){return sql.prepare(q).get(...v)||null}}}};
 row=await api.activeCode(db,'ALI20','111');assert.equal(row.percent,20);assert.equal(row.personal,1);
 assert.equal(await api.activeCode(db,'ALI20','222'),null);
 assert.equal(api.codeApplies(row,plan),true);assert.equal(api.codeApplies(row,{...plan,price:50000}),false);
 assert.equal(api.priceAfter(plan,row),120000);
 sql.prepare('UPDATE personal_codes SET used=1').run();assert.equal(await api.activeCode(db,'ALI20','111'),null);sql.prepare('UPDATE personal_codes SET used=0,expires=?').run(now-1);assert.equal(await api.activeCode(db,'ALI20','111'),null);
 sql.prepare('UPDATE personal_codes SET expires=NULL,active=0').run();assert.equal(await api.activeCode(db,'ALI20','111'),null);
});
test('public codes still work without an owner and unaffected by personal rules',async()=>{
 const {sql,api}=setup();sql.prepare('INSERT INTO discount_codes VALUES(?,?,0,0,NULL,1,?)').run('PUB10',10,Date.now());
 const db={prepare:q=>{let v=[];return{bind(...x){v=x;return this},async first(){return sql.prepare(q).get(...v)||null}}}};
 const row=await api.activeCode(db,'PUB10','222');assert.equal(row.percent,10);assert.equal(row.personal,0);assert.equal(row.code,'PUB10');
});
test('points are disabled by default, awarded at the configured rate and redeemed once atomically',async()=>{
 const {sql,api,db}=setup();assert.equal(await api.pointsAward(db,'111',150000,'خرید'),0);
 const on=setup({points_enabled:true,points_rate:2,points_value:5,points_invite:30,points_min:100});
 assert.equal(await on.api.pointsAward(on.db,'111',150000,'خرید'),300);
 await on.api.pointsAdd(on.db,'111',50,'دعوت');
 await on.api.sendPoints({},on.db,7,'111');assert.match(on.calls.at(-1).text,/350 امتیاز/);
 await on.api.pointsRedeem({},on.db,7,'111');
 assert.equal(on.sql.prepare('SELECT balance FROM points').get().balance,0);
 assert.equal(on.sql.prepare('SELECT balance FROM wallet').get().balance,1750);
 await on.api.pointsRedeem({},on.db,7,'111');assert.equal(on.sql.prepare('SELECT balance FROM wallet').get().balance,1750);
 assert.equal(on.sql.prepare('SELECT COUNT(*) n FROM wallet_log').get().n,1);
 assert.equal(on.sql.prepare('SELECT status FROM points_redeems').get().status,'done');
});
test('concurrent redemption cannot spend the same points twice and below minimum is refused',async()=>{
 const {sql,api,db}=setup({points_enabled:true,points_rate:1,points_value:2,points_min:100});
 await api.pointsAdd(db,'111',150,'خرید');
 await Promise.all([api.pointsRedeem({},db,7,'111'),api.pointsRedeem({},db,7,'111')]);
 assert.equal(sql.prepare('SELECT balance FROM points').get().balance,0);assert.equal(sql.prepare('SELECT balance FROM wallet').get().balance,300);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM points_redeems').get().n,1);
 const low=setup({points_enabled:true,points_rate:1,points_value:1,points_min:100});await low.api.pointsAdd(low.db,'111',99,'خرید');await low.api.pointsRedeem({},low.db,7,'111');
 assert.equal(low.sql.prepare('SELECT balance FROM points').get().balance,99);assert.equal(low.sql.prepare('SELECT COUNT(*) n FROM wallet').get().n,0);
});
test('admin code endpoint stores personal codes with owner, minimum and audit',()=>{
 const body=src.slice(src.indexOf('async function adminCodes('),src.indexOf('// افزودن روز اشتراک'));
 assert.match(body,/INSERT INTO personal_codes/);assert.match(body,/tg_id/);assert.match(body,/min_amount/);assert.match(body,/personal_code_create/);
 assert.match(src,/adminAuth\(request, env\);\s*if \(bad\) return bad;\s*return await adminCodes/);
});
