import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=mkdtempSync(join(tmpdir(),'setwise-test-'));
const engineBuild=await build({entryPoints:['lib/coach.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'coach.mjs')});
const {recommend,interpretCoach}=await import(pathToFileURL(join(temp,'coach.mjs')));
const v={id:'extension',name:'Single-leg leg extension',unilateral:1,increment:5,minReps:8,maxReps:12,defaultSets:3};
const session={id:'today',rules:{}};
const seed={id:'seed',variantId:'extension',sessionId:'prior',createdAt:0,weight:95,reps:10,rir:null,side:'unknown',type:'working',painSeverity:0};
const set=(overrides={})=>({...seed,id:'set1',sessionId:'today',side:'left',rir:2,createdAt:100,...overrides});
test('seed, side-specific fatigue and progression',()=>{
 assert.equal(recommend(v,session,[seed],'left').weight,95);
 assert.equal(recommend(v,session,[seed],'left').reps,10);
 assert.equal(recommend(v,session,[seed,set({rir:0})],'left').weight,90);
 assert.equal(recommend(v,session,[seed,set({rir:0})],'right').weight,95);
 assert.equal(recommend(v,session,[seed,set({reps:12,rir:2})],'left').weight,100);
 assert.equal(recommend(v,session,[seed,set({reps:12,rir:2}),set({id:'set2',createdAt:200,reps:8,rir:1})],'left').weight,85);
});
test('warmups do not drive progression; variants do not share loads',()=>{
 assert.equal(recommend(v,session,[seed,set({type:'warmup',weight:40,reps:20})],'left').weight,95);
 assert.equal(recommend({...v,id:'another-machine'},session,[seed],'left').status,'calibrate');
 assert.equal(recommend(v,session,[seed],'left','drop').weight,75);
});
test('pain, limits and conservative coach instructions',()=>{
 assert.equal(recommend(v,session,[seed,set({painSeverity:1})],'left').status,'pause');
 const sets=[1,2,3].map(i=>set({id:'s'+i,createdAt:i}));
 assert.equal(recommend(v,session,sets,'left').status,'complete');
 assert.equal(recommend(v,{...session,rules:{maxSets:2}},sets,'left','drop').status,'complete');
 assert.equal(recommend(v,{...session,rules:{maxSets:2}},sets,'left','backoff').status,'complete');
 const {rules}=interpretCoach('I am tired. Only 2 sets per exercise. 10–15 reps. Skip leg press.',{},[v,{id:'press',name:'Leg press'}],v.id,1000);
 assert.equal(recommend(v,{...session,rules:{easy:true,easySince:1000}},[seed,set()],'left').weight,85);
 assert.equal(rules.easy,true);assert.equal(rules.maxSets,2);assert.equal(rules.minReps,10);assert.deepEqual(rules.skipped,['press']);
 assert.equal(interpretCoach('no pain today',{},[v],v.id).rules.skipped.length,0);
 assert.equal(interpretCoach('use a towel',{},[v],v.id).response.includes('could not confidently'),true);
 assert.equal(recommend(v,{...session,rules:{deadline:1}},[seed],'left','backoff',100).status,'complete');
});
let sql;
function openDb(){sql=new DatabaseSync(join(temp,'workouts.sqlite'));sql.exec('PRAGMA foreign_keys=ON');}
openDb();sql.exec(readFileSync('drizzle/0000_common_trauma.sql','utf8'));
const adapter={
 prepare(text){
  return {bind(...values){
   const execute=()=>{
    const stmt=sql.prepare(text);
    if(/^\s*SELECT/i.test(text))return {results:stmt.all(...values)};
    const info=stmt.run(...values);
    return {results:[],meta:{changes:Number(info.changes)}};
   };
   return {first:async()=>execute().results[0]??null,run:async()=>execute(),execute};
  }};
 },
 async batch(statements){
  sql.exec('BEGIN');
  try{const result=statements.map(s=>s.execute());sql.exec('COMMIT');return result;}
  catch(e){sql.exec('ROLLBACK');throw e;}
 }
};
globalThis.__workoutTestDB=adapter;
await build({entryPoints:['app/api/workout/route.ts'],bundle:true,platform:'node',format:'esm',outfile:join(temp,'route.mjs'),plugins:[{name:'test-d1',setup(build){build.onResolve({filter:/^cloudflare:workers$/},()=>({path:'cloudflare:workers',namespace:'test'}));build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env={get DB(){return globalThis.__workoutTestDB}}',loader:'js'}));}}]});
const {GET,POST}=await import(pathToFileURL(join(temp,'route.mjs')));
const req=(body,owner='james')=>new Request('https://example.com/api/workout',{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':owner,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const send=async b=>{const r=await POST(req(b));return{status:r.status,data:await r.json()};};
test('database workflow: seed once, save/reopen, idempotent retry, ownership, finish',async()=>{
 assert.equal((await GET(new Request('https://example.com/api/workout'))).status,401);
 let d=await (await GET(req())).json();assert.equal(d.sets.length,1);assert.equal(d.sets[0].weight,95);assert.equal(d.sets[0].createdAt,0);
 d=await (await GET(req())).json();assert.equal(d.sets.length,1);assert.equal(d.variants.length,10);
 const active=d.sessions.find(s=>s.status==='active'),variant=d.variants.find(v=>v.name==='Single-leg leg extension');
 const payload={action:'log',id:'one',sessionId:active.id,variantId:variant.id,weight:95,reps:12,rir:2,side:'left',type:'working',painLocation:'',painSeverity:0,note:''};
 let result=await send(payload);assert.equal(result.status,200);assert.equal(result.data.sets.length,2);assert.equal(result.data.progressions[0].recommendation.weight,100);
 result=await send(payload);assert.equal(result.status,200);assert.equal(result.data.sets.length,2);assert.equal(result.data.progressions.length,1);
 sql.close();openDb();d=await (await GET(req())).json();assert.equal(d.sets.length,2);
 const other=await (await GET(req(undefined,'other-user'))).json();assert.equal(other.sets.length,1);assert.notEqual(other.sets[0].id,d.sets[0].id);
 const denied=await POST(req({...payload,id:'theft'},'other-user'));assert.equal(denied.status,400);
 result=await send({...payload,id:'pain',side:'right',painLocation:'right knee',painSeverity:2});assert.equal(result.status,200);
 result=await send({...payload,id:'pain2',side:'right'});assert.equal(result.status,400);
 result=await send({action:'coach',id:'coach1',sessionId:active.id,variantId:variant.id,message:'Go lighter. 2 sets per exercise.'});assert.equal(result.status,200);assert.equal(result.data.messages.length,1);assert.equal(result.data.sessions.find(s=>s.id===active.id).rules.easy,true);
 result=await send({action:'coach',id:'coach1',sessionId:active.id,variantId:variant.id,message:'Go lighter. 2 sets per exercise.'});assert.equal(result.data.messages.length,1);
 result=await send({action:'finish',sessionId:active.id});assert.equal(result.status,200);assert.equal(result.data.sessions.some(s=>s.status==='active'),false);
 result=await send({...payload,id:'late'});assert.equal(result.status,400);
 result=await send({action:'start',id:'new-day',name:'Next leg day',plan:active.plan});assert.equal(result.status,200);assert.equal(result.data.sessions.filter(s=>s.status==='active').length,1);
 sql.close();rmSync(temp,{recursive:true,force:true});
});
