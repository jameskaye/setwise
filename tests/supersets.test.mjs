import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
const temp=mkdtempSync(join(tmpdir(),'setwise-supersets-'));
await build({entryPoints:['lib/supersets.ts','lib/routine.ts'],bundle:true,platform:'node',format:'esm',outdir:temp});
const {nextSupersetSet,nextAfterSavedSet}=await import(pathToFileURL(join(temp,'supersets.js')));
const {workoutTemplateSchema}=await import(pathToFileURL(join(temp,'routine.js')));
const v=(id,unilateral=0,defaultSets=3)=>({id,unilateral,defaultSets,minReps:8,maxReps:12,increment:5});
const session={id:'s',plan:['a','b'],rules:{supersets:[['a','b']]}};
const log=(state,id,side='both',extra={})=>state.sets.push({id:String(state.sets.length),sessionId:'s',variantId:id,side,type:'working',weight:50,reps:10,rir:null,painSeverity:0,createdAt:state.sets.length,...extra});
test('bilateral pairs alternate after each confirmed working set, warmups stay put',()=>{const s={variants:[v('a'),v('b')],sets:[]};log(s,'a');assert.equal(nextSupersetSet(s,session,'a').variantId,'b');log(s,'b');assert.equal(nextSupersetSet(s,session,'b').variantId,'a');assert.equal(nextSupersetSet(s,session,'a','warmup'),null);});
test('unilateral exercises finish both sides before switching; combined entries alternate exercises',()=>{
 const s={variants:[v('a',1),v('b',1)],sets:[]};
 log(s,'a','left');assert.equal(nextSupersetSet(s,session,'a').variantId,'a');assert.equal(nextSupersetSet(s,session,'a').side,'right');
 log(s,'a','right');assert.equal(nextSupersetSet(s,session,'a').variantId,'b');
 log(s,'b','left');assert.equal(nextSupersetSet(s,session,'b').variantId,'b');
 log(s,'b','right');assert.equal(nextSupersetSet(s,session,'b').variantId,'a');
 const combined={variants:[v('a',1),v('b',1)],sets:[]};log(combined,'a');assert.equal(nextSupersetSet(combined,session,'a').variantId,'b');log(combined,'b');assert.deepEqual(nextSupersetSet(combined,session,'b'),{variantId:'a',side:'left',rounds:1});
 const m={variants:[v('a'),v('b',1)],sets:[]};log(m,'a');assert.equal(nextSupersetSet(m,session,'a').side,'left');log(m,'b','left');assert.equal(nextSupersetSet(m,session,'b').side,'right');log(m,'b','right');assert.equal(nextSupersetSet(m,session,'b').variantId,'a');
});
test('unequal goals, pain pauses, skipped exercises, undo and reload',()=>{
 const s={variants:[v('a',0,1),v('b',0,2)],sets:[]};log(s,'a');log(s,'b');assert.equal(nextSupersetSet(s,session,'b').variantId,'b');log(s,'b');assert.equal(nextSupersetSet(s,session,'b'),null);s.sets.pop();assert.equal(nextSupersetSet(JSON.parse(JSON.stringify(s)),session,'b').variantId,'b');
 s.sets[1].painSeverity=1;assert.equal(nextSupersetSet(s,session,'a'),null);
 const fresh={variants:[v('a'),v('b')],sets:[]};log(fresh,'a');assert.equal(nextSupersetSet(fresh,{...session,rules:{...session.rules,skipped:['b']}},'a').variantId,'a');
});
test('pair schema rejects duplicates, self-pairs and exercises outside workout',()=>{
 const w={id:'day',name:'Day',notes:'',timeLimitMinutes:null,exercises:['a','b','c'].map(variantId=>({variantId,minReps:8,maxReps:12,sets:3,targetRir:2}))};
 assert.equal(workoutTemplateSchema.safeParse({...w,supersets:[['a','b']]}).success,true);
 for(const supersets of [[['a','a']],[['a','b'],['b','c']],[['a','foreign']]])assert.equal(workoutTemplateSchema.safeParse({...w,supersets}).success,false);
});
test('completed unpaired exercises advance automatically, warmups stay put, last exercise opens finish',()=>{
 const s={variants:[v('a',0,1),v('b',0,1)],sets:[]},plain={...session,rules:{}};
 assert.equal(nextAfterSavedSet(s,plain,'a'),null);
 log(s,'a');assert.deepEqual(nextAfterSavedSet(s,plain,'a'),{variantId:'b'});
 assert.equal(nextAfterSavedSet(s,plain,'a','warmup'),null);
 log(s,'b');assert.deepEqual(nextAfterSavedSet(s,plain,'b'),{finish:true});
});
test.after(()=>rmSync(temp,{recursive:true,force:true}));
