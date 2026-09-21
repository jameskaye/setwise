import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=mkdtempSync(join(tmpdir(),'setwise-rtf-'));
await build({entryPoints:['lib/rtf.ts','lib/coach.ts'],bundle:true,platform:'node',format:'esm',outdir:temp});
const {RTF_MAIN,RTF_AUXILIARY,rtfAdjustment,buildProgramSession,liftOutcome,programWeek}=await import(pathToFileURL(join(temp,'rtf.js')));
const {recommend}=await import(pathToFileURL(join(temp,'coach.js')));
const variant={id:'bench',name:'Bench',unilateral:0,increment:5,minReps:4,maxReps:6,defaultSets:3};
const routine={name:'test',notes:'',constraints:[],program:{id:'cycle',lifts:[{workoutId:'a',variantId:'bench',profile:'main',trainingMax:250}]},workouts:[{id:'a',exercises:[{variantId:'bench',sets:3,minReps:4,maxReps:6,targetRir:1}]}]};
const state=()=>({variants:[variant],sessions:[],sets:[]});
const start=(s,r=routine)=>{const session={id:'session-'+s.sessions.length,status:'active',rules:{program:buildProgramSession(r,'a',s)},plan:['bench']};s.sessions.push(session);return session;};
const log=(s,session,side,reps,extra={})=>{const rec=recommend(s.variants[0],session,s.sets,side);const set={id:'set-'+s.sets.length,sessionId:session.id,variantId:'bench',createdAt:s.sets.length,weight:rec.weight,reps,rir:0,side,type:'working',painSeverity:0,...extra};s.sets.push(set);return set;};
const finish=s=>{s.status='finished';s.rules.program.advance=true;};
test('all 21 weekly prescriptions match workbook schedules including workout-sheet deload overrides',()=>{
 assert.deepEqual(RTF_MAIN.map(r=>r[0]),[.7,.75,.8,.725,.775,.825,.6,.75,.8,.85,.775,.825,.875,.6,.8,.85,.9,.85,.9,.95,.6]);
 assert.deepEqual(RTF_AUXILIARY.map(r=>r[0]),[.6,.65,.7,.625,.675,.725,.5,.65,.7,.75,.675,.725,.775,.5,.7,.75,.8,.75,.8,.85,.5]);
 const s=state();
 for(let week=1;week<=21;week++){
  const session=start(s),lift=session.rules.program.lifts[0];assert.equal(session.rules.program.week,week);
  if(week%7===0){assert.equal(lift.reps,5);assert.equal(lift.repOutTarget,null);}
  else assert.equal(lift.repOutTarget,RTF_MAIN[week-1][2]);
  for(let i=0;i<3;i++)log(s,session,'both',i===2&&lift.repOutTarget!==null?lift.repOutTarget:lift.reps);
  const outcome=liftOutcome(session,lift,'both',s.sets);assert.equal(outcome.trainingMax,250);finish(session);
 }
 assert.equal(programWeek(routine,'a',s.sessions),22);assert.throws(()=>start(s),/21 weeks/);
});
test('all rep-out adjustment thresholds, not RIR, change next week training max',()=>{
 assert.deepEqual([-4,-2,-1,0,1,2,3,4,5,10].map(d=>rtfAdjustment(10+d,10)),[-.05,-.05,-.02,0,.005,.01,.015,.02,.03,.03]);
 const s=state(),session=start(s);log(s,session,'both',5);
 assert.equal(recommend(variant,session,s.sets,'both').weight,175,'zero RIR does not reduce fixed working weight');
 log(s,session,'both',5);assert.equal(recommend(variant,session,s.sets,'both').repOut,true);
 log(s,session,'both',12);finish(session);
 const next=start(s);assert.equal(next.rules.program.lifts[0].trainingMax.both,252.5);assert.equal(recommend(variant,next,s.sets,'both').weight,190);
});
test('left and right progress separately; undo removes the result; changed loads, incomplete and painful sets hold max',()=>{
 const s=state();s.variants=[{...variant,unilateral:1}];const session=start(s),lift=session.rules.program.lifts[0];
 for(const side of ['left','right'])for(let i=0;i<3;i++)log(s,session,side,i===2?(side==='left'?12:9):5);
 assert.equal(liftOutcome(session,lift,'left',s.sets).trainingMax,252.5);
 assert.equal(liftOutcome(session,lift,'right',s.sets).trainingMax,245);
 s.sets.pop();assert.equal(liftOutcome(session,lift,'right',s.sets).trainingMax,250);
 s.sets[2].weight=180;assert.equal(liftOutcome(session,lift,'left',s.sets).trainingMax,250);
 s.sets[2].weight=175;s.sets[0].painSeverity=1;assert.equal(liftOutcome(session,lift,'left',s.sets).trainingMax,250);
});
test('unknown load calibration, controlled recovery and accessory double progression',()=>{
 for(const profile of ['main','controlled','accessory']){
  const r=structuredClone(routine);r.program.lifts[0]={workoutId:'a',variantId:'bench',profile};
  const s=state(),session=start(s,r);
  assert.equal(recommend(variant,session,s.sets,'both').weight,null);
  for(let i=0;i<3;i++)log(s,session,'both',profile==='main'?(i===2?10:5):6,{weight:100});
  finish(session);const next=start(s,r),lift=next.rules.program.lifts[0];
  assert.equal(lift.weight.both,profile==='main'?105:profile==='accessory'?105:100);
 }
});
test('a training-max override raises the floor mid-cycle; the chain still owns decreases',()=>{
 const s=state(),session=start(s);
 for(let i=0;i<3;i++)log(s,session,'both',i===2?12:5);finish(session); // rep-out 12 vs 10 -> chain TM 252.5
 const raised=structuredClone(routine);raised.program.lifts[0].trainingMaxOverride=260;
 const next=start(s,raised),lift=next.rules.program.lifts[0];
 assert.equal(lift.trainingMax.both,260);
 assert.equal(lift.weight.both,195); // week 2 at 75%
 const stale=structuredClone(routine);stale.program.lifts[0].trainingMaxOverride=240;
 const next2=start(s,stale);
 assert.equal(next2.rules.program.lifts[0].trainingMax.both,252.5,'override below the chain stays dormant');
});
test('without an override the chain still applies downward adjustments',()=>{
 const s=state(),session=start(s);
 for(let i=0;i<3;i++)log(s,session,'both',i===2?9:5);finish(session); // rep-out 9 vs 10 -> -2%
 const next=start(s);
 assert.equal(next.rules.program.lifts[0].trainingMax.both,245);
});
test.after(()=>rmSync(temp,{recursive:true,force:true}));
