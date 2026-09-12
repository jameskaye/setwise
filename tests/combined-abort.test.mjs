import test from 'node:test';
import assert from 'node:assert/strict';
import {accountHarness} from './account-harness.mjs';
test('combined entries persist once, progress both sides, and abort removes only the active workout without advancing',async()=>{
 const h=await accountHarness();try{
 const cookie=(await h.login(h.loginKey)).headers.get('set-cookie').split(';')[0];
 const read=async()=> (await h.call('/api/workout',cookie)).json(),post=a=>h.call('/api/workout',cookie,a);
 let s=await read();const v=s.variants[0];
 const routine={name:'Combined test',notes:'',constraints:[],workouts:[{id:'a',name:'A',notes:'',timeLimitMinutes:null,exercises:[{variantId:v.id,minReps:5,maxReps:5,sets:2,targetRir:0}]}],program:{id:'cycle',lifts:[{workoutId:'a',variantId:v.id,profile:'main',trainingMax:100}]}};
 assert.equal((await post({action:'save_routine',requestId:'plan',expectedRevision:0,reason:'Test',routine})).status,200);
 const start=id=>post({action:'start',id,name:'A',plan:[v.id],workoutId:'a',expectedRoutineRevision:1});
 const log=(sessionId,id,reps)=>post({action:'log',sessionId,id,variantId:v.id,weight:70,reps,rir:null,side:'both',type:'working',painLocation:'',painSeverity:0,note:''});
 await start('discard-me');assert.equal((await log('discard-me','one',5)).status,200);assert.equal((await log('discard-me','one',5)).status,200);
 s=await read();assert.equal(s.sets.length,1);assert.equal(s.sets[0].side,'both');assert.equal(s.progressions.length,1);
 h.sql.prepare('INSERT INTO coach_messages (id,owner,session_id,created_at,message,response) VALUES (?,?,?,?,?,?)').run('message',s.account.id,'discard-me',Date.now(),'test','test');
 h.sql.prepare('INSERT INTO coach_requests (owner,id,created_at,message,status,proposal) VALUES (?,?,?,?,?,?)').run(s.account.id,'proposal',Date.now(),'test','proposed',JSON.stringify({sessionId:'discard-me'}));
 const planBefore=s.routine;
 assert.equal((await post({action:'abort',sessionId:'discard-me'})).status,200);
 assert.equal((await post({action:'abort',sessionId:'discard-me'})).status,200,'retry after a lost reply succeeds');
 assert.equal((await log('discard-me','late',5)).status,400,'late/retried sets cannot restore a discarded session');
 s=await read();for(const field of ['sessions','sets','progressions','messages'])assert.equal(s[field].length,0,field);assert.deepEqual(s.routine,planBefore);assert.equal(h.sql.prepare('SELECT count(*) n FROM coach_requests').get().n,0);
 await start('keep-me');s=await read();assert.equal(s.sessions[0].rules.program.week,1);
 await log('keep-me','normal',5);await log('keep-me','repout',12);
 assert.equal((await post({action:'finish',sessionId:'keep-me'})).status,200);
 const kept=(await read()).sets;
 assert.equal((await post({action:'abort',sessionId:'keep-me'})).status,400,'finished history cannot be discarded');
 await start('week-two');s=await read();const program=s.sessions.find(s=>s.id==='week-two').rules.program;assert.equal(program.week,2);assert.equal(program.lifts[0].trainingMax.left,101);assert.equal(program.lifts[0].trainingMax.right,101);
 assert.equal((await post({action:'abort',sessionId:'week-two'})).status,200);assert.deepEqual((await read()).sets,kept);
 await start('week-two-retry');s=await read();assert.equal(s.sessions.find(s=>s.status==='active').rules.program.week,2);
 const partnerKey=(await (await h.call('/api/account',cookie,{action:'create_partner',name:'Partner'})).json()).key;
 const partner=(await h.login(partnerKey)).headers.get('set-cookie').split(';')[0];await h.call('/api/workout',partner);
 await h.call('/api/workout',partner,{action:'abort',sessionId:'week-two-retry'});assert.ok((await read()).sessions.some(s=>s.id==='week-two-retry'));
 }finally{h.close();}
});
