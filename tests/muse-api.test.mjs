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
const museKey='muse-test-'.padEnd(48,'m'),coachKey='coach-test-'.padEnd(48,'c'),loginKey='login-test-'.padEnd(48,'l');
const hash=x=>createHash('sha256').update(x).digest('hex');
globalThis.__museEnv={DB:adapter,AUTH_MODE:'standalone',OWNER_ID:'test-owner',MUSE_KEY_HASH:hash(museKey),COACH_KEY_HASH:hash(coachKey),LOGIN_KEY_HASH:hash(loginKey),SESSION_SECRET:'test-session-secret-'.padEnd(48,'s'),ASSETS:{fetch:async()=>new Response('Setwise UI')}};
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
 // The site sign-in key doubles as a Muse credential; it still grants no coach access.
 const loginHeaders={Authorization:'Bearer '+loginKey};
 assert.equal((await call('/api/muse',{headers:loginHeaders})).status,200,'login key opens the Muse API');
 assert.equal((await call('/api/coach',{headers:loginHeaders})).status,401,'login key grants no coach access');

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

 // Arbitrary historical set edit and delete.
 const editId=crypto.randomUUID();
 assert.equal((await post('/api/muse',{action:'log',id:editId,sessionId,variantId:variant.id,weight:70,reps:8,rir:2,side,type:'working',painLocation:'',painSeverity:0,note:'edit me'})).status,200);
 assert.equal((await post('/api/muse',{action:'update_set',setId:editId,patch:{reps:9,note:'edited'}})).status,200);
 hist=await (await get('/api/muse/history?kind=sets&variantId='+variant.id)).json();
 const edited=hist.items.find(s=>s.id===editId);
 assert.equal(edited.reps,9);
 assert.equal(edited.note,'edited');
 // Reapplying identical values is a safe no-op.
 assert.equal((await post('/api/muse',{action:'update_set',setId:editId,patch:{reps:9,note:'edited'}})).status,200);
 assert.equal((await post('/api/muse',{action:'update_set',setId:crypto.randomUUID(),patch:{reps:5}})).status,404,'unknown set');
 assert.equal((await post('/api/muse',{action:'update_set',setId:editId,patch:{}})).status,400,'empty patch rejected');
 assert.equal((await post('/api/muse',{action:'update_set',setId:editId,patch:{painSeverity:5}})).status,400,'pain without location rejected');
 if(!variant.unilateral)assert.equal((await post('/api/muse',{action:'update_set',setId:editId,patch:{side:'left'}})).status,400,'bilateral set rejects single side');
 // Delete is idempotent: first call deletes, the retry reports deleted:false.
 const del=await post('/api/muse',{action:'delete_set',setId:editId});
 assert.equal(del.status,200);
 assert.equal((await del.json()).setDeleted.deleted,true);
 assert.equal((await (await post('/api/muse',{action:'delete_set',setId:editId})).json()).setDeleted.deleted,false);
 assert.equal((await (await post('/api/muse',{action:'delete_set',setId:crypto.randomUUID()})).json()).setDeleted.deleted,false);
 hist=await (await get('/api/muse/history?kind=sets&variantId='+variant.id)).json();
 assert.ok(!hist.items.some(s=>s.id===editId),'deleted set is gone from history');

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
});

test('Muse API: swap_variant exchanges a linked variation mid-workout',async()=>{
 const mkVariant=(id,name)=>post('/api/muse',{action:'variant',id,exerciseId:'',baseName:'Press',name,equipment:'Machine',unilateral:false,loadMode:'machine load',increment:5,minReps:6,maxReps:10,defaultSets:4});
 assert.equal((await mkVariant('swap-smith','Swap Smith Press')).status,200);
 assert.equal((await mkVariant('swap-ohp','Swap OHP')).status,200);
 const routine={name:'Swap routine',notes:'',constraints:[],program:{id:'swap-cycle',lifts:[{workoutId:'sw',variantId:'swap-smith',profile:'auxiliary',trainingMax:160}]},workouts:[{id:'sw',name:'Swap day',notes:'',timeLimitMinutes:null,exercises:[{variantId:'swap-smith',linkedVariants:['swap-ohp'],sets:4,minReps:6,maxReps:10,targetRir:1}]}]};
 assert.equal((await post('/api/muse',{action:'save_routine',requestId:crypto.randomUUID(),expectedRevision:0,reason:'swap test',routine})).status,200);
 const sessionId=crypto.randomUUID();
 assert.equal((await post('/api/muse',{action:'start',id:sessionId,name:'Swap day',plan:['swap-smith'],workoutId:'sw',expectedRoutineRevision:1})).status,200);
 let ctx=await (await get('/api/muse')).json();
 const before=ctx.activeSession.rules.program.lifts[0];
 assert.equal(before.variantId,'swap-smith');
 assert.ok(before.trainingMax.both>0,'programmed training max present');
 const weightBefore=before.weight.both;

 // Swap to the linked alternate: plan, prescriptions, and program lift follow,
 // while the programmed training max, weight, and profile are preserved.
 assert.equal((await post('/api/muse',{action:'swap_variant',sessionId,from:'swap-smith',to:'swap-ohp'})).status,200);
 ctx=await (await get('/api/muse')).json();
 assert.deepEqual(ctx.activeSession.plan,['swap-ohp']);
 assert.equal(ctx.activeSession.prescriptions[0].variantId,'swap-ohp');
 const after=ctx.activeSession.rules.program.lifts[0];
 assert.equal(after.variantId,'swap-ohp');
 assert.equal(after.profile,'auxiliary');
 assert.equal(after.trainingMax.both,before.trainingMax.both,'training max preserved across the swap');
 assert.equal(after.weight.both,weightBefore,'programmed weight preserved across the swap');
 assert.equal(after.modified,undefined,'swap is transparent to progression, not a modification');

 // Guards: unknown target, non-linked target, duplicate, and logged sets.
 assert.equal((await post('/api/muse',{action:'swap_variant',sessionId,from:'swap-ohp',to:'nope'})).status,400);
 assert.equal((await post('/api/muse',{action:'swap_variant',sessionId,from:'swap-ohp',to:'swap-ohp'})).status,400);
 // Log a set for the new variant, then swapping away is refused.
 const setId=crypto.randomUUID();
 assert.equal((await post('/api/muse',{action:'log',id:setId,sessionId,variantId:'swap-ohp',weight:weightBefore,reps:7,rir:1,side:'both',type:'working',painLocation:'',painSeverity:0,note:''})).status,200);
 assert.equal((await post('/api/muse',{action:'swap_variant',sessionId,from:'swap-ohp',to:'swap-smith'})).status,400,'sets logged: swap refused');
 // Swapping back is fine once the set is undone.
 assert.equal((await post('/api/muse',{action:'undo',setId,sessionId})).status,200);
 assert.equal((await post('/api/muse',{action:'swap_variant',sessionId,from:'swap-ohp',to:'swap-smith'})).status,200);
 ctx=await (await get('/api/muse')).json();
 assert.deepEqual(ctx.activeSession.plan,['swap-smith']);
 assert.equal((await post('/api/muse',{action:'finish',sessionId})).status,200);
});

test('Muse API: swap_variant force overrides guards on explicit command',async()=>{
 // Force swap with logged sets: the sets move to the new variant.
 let sessionId=crypto.randomUUID();
 assert.equal((await post('/api/muse',{action:'start',id:sessionId,name:'Force swap day',plan:['swap-smith'],workoutId:'sw',expectedRoutineRevision:1})).status,200);
 let ctx=await (await get('/api/muse')).json();
 const weight=ctx.activeSession.rules.program.lifts[0].weight.both;
 const setId=crypto.randomUUID();
 assert.equal((await post('/api/muse',{action:'log',id:setId,sessionId,variantId:'swap-smith',weight,reps:7,rir:1,side:'both',type:'working',painLocation:'',painSeverity:0,note:''})).status,200);
 assert.equal((await post('/api/muse',{action:'swap_variant',sessionId,from:'swap-smith',to:'swap-ohp'})).status,400,'without force: refused');
 assert.equal((await post('/api/muse',{action:'swap_variant',sessionId,from:'swap-smith',to:'swap-ohp',force:true})).status,200);
 ctx=await (await get('/api/muse')).json();
 assert.deepEqual(ctx.activeSession.plan,['swap-ohp']);
 const hist=await (await get('/api/muse/history?kind=sets&sessionId='+sessionId)).json();
 assert.ok(hist.items.some(s=>s.id===setId&&s.variantId==='swap-ohp'),'logged set moved to the new variant');
 const lift=ctx.activeSession.rules.program.lifts[0];
 assert.equal(lift.variantId,'swap-ohp');
 assert.equal(lift.modified,undefined,'linked swap stays transparent even when forced');
 assert.equal((await post('/api/muse',{action:'finish',sessionId})).status,200);

 // Force swap to a non-linked variation: allowed, but the lift is marked
 // modified so automatic progression holds instead of misattributing.
 assert.equal((await post('/api/muse',{action:'variant',id:'swap-row',exerciseId:'',baseName:'Row',name:'Swap Row',equipment:'Barbell',unilateral:false,loadMode:'total load',increment:5,minReps:6,maxReps:10,defaultSets:4})).status,200);
 sessionId=crypto.randomUUID();
 assert.equal((await post('/api/muse',{action:'start',id:sessionId,name:'Force swap day 2',plan:['swap-smith'],workoutId:'sw',expectedRoutineRevision:1})).status,200);
 assert.equal((await post('/api/muse',{action:'swap_variant',sessionId,from:'swap-smith',to:'swap-row'})).status,400,'without force: refused');
 assert.equal((await post('/api/muse',{action:'swap_variant',sessionId,from:'swap-smith',to:'swap-row',force:true})).status,200);
 ctx=await (await get('/api/muse')).json();
 const forced=ctx.activeSession.rules.program.lifts.find(l=>l.variantId==='swap-row');
 assert.equal(forced.modified,true,'non-linked forced swap holds progression');
 assert.equal((await post('/api/muse',{action:'finish',sessionId})).status,200);
});

test('Muse API: programmed sessions allow reordering but not lineup changes',async()=>{
 const routine={name:'Reorder routine',notes:'',constraints:[],program:{id:'swap-cycle',lifts:[
  {workoutId:'sw',variantId:'swap-smith',profile:'auxiliary',trainingMax:160},
  {workoutId:'sw',variantId:'swap-ohp',profile:'auxiliary',trainingMax:160},
 ]},workouts:[{id:'sw',name:'Swap day',notes:'',timeLimitMinutes:null,exercises:[
  {variantId:'swap-smith',sets:4,minReps:6,maxReps:10,targetRir:1},
  {variantId:'swap-ohp',sets:4,minReps:6,maxReps:10,targetRir:1},
 ]}]};
 const _dbg=await post('/api/muse',{action:'save_routine',requestId:crypto.randomUUID(),expectedRevision:1,reason:'reorder test',routine});
 assert.equal(_dbg.status,200);
 const sessionId=crypto.randomUUID();
 assert.equal((await post('/api/muse',{action:'start',id:sessionId,name:'Reorder day',plan:['swap-smith','swap-ohp'],workoutId:'sw',expectedRoutineRevision:2})).status,200);
 // Reorder: same exercises, different order -> allowed.
 assert.equal((await post('/api/muse',{action:'session',sessionId,name:'Reorder day',notes:'',plan:['swap-ohp','swap-smith']})).status,200);
 const ctx=await (await get('/api/muse')).json();
 assert.deepEqual(ctx.activeSession.plan,['swap-ohp','swap-smith']);
 // Adding or removing exercises -> still rejected for programmed sessions.
 assert.equal((await post('/api/muse',{action:'session',sessionId,name:'Reorder day',notes:'',plan:['swap-ohp']})).status,400);
 assert.equal((await post('/api/muse',{action:'session',sessionId,name:'Reorder day',notes:'',plan:['swap-ohp','swap-smith','swap-row']})).status,400);
 assert.equal((await post('/api/muse',{action:'finish',sessionId})).status,200);

 sql.close();rmSync(temp,{recursive:true,force:true});
});
