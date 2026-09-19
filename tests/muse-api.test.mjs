import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const temp=mkdtempSync(join(tmpdir(),'setwise-muse-'));
const sql=new DatabaseSync(join(temp,'muse.sqlite'));sql.exec('PRAGMA foreign_keys=ON');
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('drizzle/'+f,'utf8'));
const adapter={prepare(text){return{bind(...values){const execute=()=>{const stmt=sql.prepare(text);if(/^\s*SELECT/i.test(text))return{results:stmt.all(...values)};const info=stmt.run(...values);return{results:[],meta:{changes:Number(info.changes)}};};return{first:async()=>execute().results[0]??null,all:async()=>execute(),run:async()=>execute(),execute};}};},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.execute());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const museKey='muse-test-'.padEnd(48,'m'),coachKey='coach-test-'.padEnd(48,'c');
const hash=x=>createHash('sha256').update(x).digest('hex');
globalThis.__museEnv={DB:adapter,AUTH_MODE:'standalone',OWNER_ID:'test-owner',MUSE_KEY_HASH:hash(museKey),COACH_KEY_HASH:hash(coachKey),LOGIN_KEY_HASH:hash('login'),SESSION_SECRET:'test-session-secret-'.padEnd(48,'s'),ASSETS:{fetch:async()=>new Response('Setwise UI')}};
await build({entryPoints:['standalone/worker.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'worker.mjs'),plugins:[{name:'test-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__museEnv',loader:'js'}));}}]});
const worker=(await import(pathToFileURL(join(temp,'worker.mjs')))).default;
const museHeaders={Authorization:'Bearer '+museKey};
const call=(path,{method='GET',body,headers={}}={})=>worker.fetch(new Request('https://setwise.test'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}));
const get=path=>call(path,{headers:museHeaders});
const post=(path,body)=>call(path,{method:'POST',headers:museHeaders,body});
const put=(path,body)=>call(path,{method:'PUT',headers:museHeaders,body});

test('Muse API: credential isolation, today workout, logging, apply, history',async()=>{
 // No credential, wrong credential, and the legacy coach credential are all rejected.
 assert.equal((await call('/api/muse')).status,401);
 assert.equal((await call('/api/muse',{headers:{Authorization:'Bearer wrong-key-that-is-long-enough-0123456789'}})).status,401);
 assert.equal((await call('/api/muse',{headers:{Authorization:'Bearer '+coachKey}})).status,401);
 assert.equal((await call('/api/coach',{headers:museHeaders})).status,401,'muse key grants no browser-cookie endpoint access');
 assert.equal((await call('/api/muse',{method:'POST',body:{action:'session',sessionId:'x',name:'x',notes:'',plan:[]}})).status,401,'unauthenticated writes rejected');

 // Today's workout read works and seeds the starter catalog.
 let ctx=await (await get('/api/muse')).json();
 assert.ok(ctx.variants.length>=8,'starter variants seeded');
 assert.ok(ctx.exercises.length>=8);
 assert.equal(ctx.activeSession,null);
 assert.equal(ctx.units,'lb');

 // Start a workout through the Muse API.
 const plan=ctx.variants.slice(0,3).map(v=>v.id);
 const sessionId=crypto.randomUUID();
 assert.equal((await post('/api/muse',{action:'start',id:sessionId,name:'Muse test day',plan})).status,200);
 ctx=await (await get('/api/muse')).json();
 const active=ctx.activeSession;
 assert.equal(active.id,sessionId);
 assert.equal(active.name,'Muse test day');
 assert.deepEqual(active.plan,plan);

 // Log a set, then read it back through history.
 const variant=ctx.variants.find(v=>v.id===plan[0]);
 const side=variant.unilateral?'left':'both';
 const setId=crypto.randomUUID();
 const logged={action:'log',id:setId,sessionId,variantId:variant.id,weight:80,reps:11,rir:1,side,type:'working',painLocation:'',painSeverity:0,note:'muse test'};
 assert.equal((await post('/api/muse',logged)).status,200);
 assert.equal((await post('/api/muse',logged)).status,200,'repeat delivery is idempotent');
 assert.equal((await post('/api/muse',{...logged,id:crypto.randomUUID(),reps:12})).status,200);
 let hist=await (await get('/api/muse/history?kind=sets&variantId='+variant.id)).json();
 assert.equal(hist.total,2);
 assert.equal(hist.items[0].weight,80);
 assert.equal(hist.items[0].reps,12);
 assert.equal(hist.items[0].rir,1);
 assert.equal(hist.items[0].note,'muse test');

 // Session history lists the active workout.
 const sessions=await (await get('/api/muse/history?kind=sessions')).json();
 assert.ok(sessions.items.some(s=>s.id===sessionId&&s.setCount===2));

 // Replace the workout via apply: rename + change prescriptions, sets preserved.
 const before=await (await get('/api/muse')).json();
 const applyBody={requestId:crypto.randomUUID(),sessionId,expectedConfiguration:before.activeSession.configurationVersion,reason:'muse test apply',workout:{name:'Muse test day v2',exercises:plan.map(id=>({variantId:id,minReps:6,maxReps:10,sets:4,targetRir:2}))}};
 const applied=await post('/api/muse/apply',applyBody);
 assert.equal(applied.status,200);
 const appliedBody=await applied.json();
 assert.equal(appliedBody.saved,true);
 ctx=await (await get('/api/muse')).json();
 assert.equal(ctx.activeSession.name,'Muse test day v2');
 assert.equal(ctx.activeSession.prescriptions.length,3);
 assert.equal(ctx.activeSession.prescriptions[0].sets,4);
 hist=await (await get('/api/muse/history?kind=sets&variantId='+variant.id)).json();
 assert.equal(hist.total,2,'logged sets survive workout replacement');
 // Replaying the same requestId is idempotent.
 assert.equal((await (await post('/api/muse/apply',applyBody)).json()).replayed,true);

 // Targeted session update: rename + reorder plan.
 const reordered=[plan[2],plan[0],plan[1]];
 assert.equal((await post('/api/muse',{action:'session',sessionId,name:'Reordered day',notes:'keep',plan:reordered})).status,200);
 ctx=await (await get('/api/muse')).json();
 assert.equal(ctx.activeSession.name,'Reordered day');
 assert.deepEqual(ctx.activeSession.plan,reordered);

 // Training constraint via the coach action (natural-language instruction).
 assert.equal((await post('/api/muse',{action:'coach',id:crypto.randomUUID(),sessionId,variantId:plan[0],message:'Keep 2 RIR today and cap at 3 sets per exercise'})).status,200);
 ctx=await (await get('/api/muse')).json();
 assert.equal(ctx.activeSession.rules.targetRir,2);
 assert.equal(ctx.activeSession.rules.maxSets,3);

 // Undo removes the latest set; the earlier set remains.
 const remaining=hist.items;
 assert.equal((await post('/api/muse',{action:'undo',setId:remaining[0].id,sessionId})).status,200);
 hist=await (await get('/api/muse/history?kind=sets&variantId='+variant.id)).json();
 assert.equal(hist.total,1);
 assert.equal(hist.items[0].reps,11);

 // Routine read works; write path validates input.
 const routine=await (await get('/api/muse/routine')).json();
 assert.ok(routine===null||typeof routine.revision==='number');
 assert.equal((await put('/api/muse/routine',{requestId:'x',expectedRevision:0,reason:'x',routine:{}})).status,400);

 // Finish the session; the workout is no longer active.
 assert.equal((await post('/api/muse',{action:'finish',sessionId})).status,200);
 ctx=await (await get('/api/muse')).json();
 assert.equal(ctx.activeSession,null);
 const done=await (await get('/api/muse/history?kind=sessions')).json();
 assert.ok(done.items.some(s=>s.id===sessionId&&s.status==='finished'));

 sql.close();rmSync(temp,{recursive:true,force:true});
});
