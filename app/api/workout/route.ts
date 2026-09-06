import {z} from 'zod';
import {database,query,initialize,snapshot} from '@/db/store';
import {interpretCoach,recommend} from '@/lib/coach';
import type {LoggedSet} from '@/lib/model';
export const dynamic='force-dynamic';
const id=z.string().min(1).max(180), num=z.number().finite();
const action=z.discriminatedUnion('action',[
 z.object({action:z.literal('log'),id:id,sessionId:id,variantId:id,weight:num.min(0).max(2000),reps:num.int().min(1).max(100),rir:num.int().min(0).max(3),side:z.enum(['left','right','both']),type:z.enum(['working','warmup','backoff','drop']),painLocation:z.string().max(100),painSeverity:num.int().min(0).max(10),note:z.string().max(1000)}),
 z.object({action:z.literal('undo'),setId:id,sessionId:id}),
 z.object({action:z.literal('finish'),sessionId:id}),
 z.object({action:z.literal('start'),id:id,name:z.string().trim().min(1).max(80),plan:z.array(id).min(1).max(30)}),
 z.object({action:z.literal('session'),sessionId:id,name:z.string().trim().min(1).max(80),notes:z.string().max(4000),plan:z.array(id).min(1).max(30)}),
 z.object({action:z.literal('coach'),id:id,sessionId:id,variantId:id,message:z.string().trim().min(1).max(2000)}),
 z.object({action:z.literal('variant'),id:id,exerciseId:z.string().max(180),baseName:z.string().trim().max(80),name:z.string().trim().min(1).max(100),equipment:z.string().trim().min(1).max(100),unilateral:z.boolean(),loadMode:z.enum(['per leg','per dumbbell','total load','machine load']),increment:num.min(.5).max(100),minReps:num.int().min(1).max(50),maxReps:num.int().min(1).max(50),defaultSets:num.int().min(1).max(10)}),
 z.object({action:z.literal('targets'),variantId:id,increment:num.min(.5).max(100),minReps:num.int().min(1).max(50),maxReps:num.int().min(1).max(50),defaultSets:num.int().min(1).max(10)})
]);
class InputError extends Error{}
function ownerOf(r:Request){const owner=r.headers.get('oai-authenticated-user-id');if(!owner)throw new InputError('Sign in to open your workouts.');return owner;}
function reply(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store, private'}});}
function errorReply(e:unknown){if(e instanceof InputError)return reply({error:e.message},e.message.startsWith('Sign in')?401:400);if(e instanceof z.ZodError)return reply({error:'Check your entries. Weight, reps, and target ranges must be valid numbers.'},400);console.error('Workout storage request failed',e);return reply({error:'Could not reach your saved workouts. Your entries are still here. Please retry.'},503);}
export async function GET(r:Request){try{const owner=ownerOf(r);await initialize(owner);return reply(await snapshot(owner));}catch(e){return errorReply(e);}}
export async function POST(r:Request){try{
  const owner=ownerOf(r);
  if(r.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Open this action from your workout.'},403);
  const a=action.parse(await r.json()),state=await snapshot(owner),now=Date.now();
  const session='sessionId' in a?state.sessions.find(s=>s.id===a.sessionId):undefined;
  if('sessionId' in a && (!session||session.status!=='active'))throw new InputError('This workout has finished. Reload or start another workout.');
  if('variantId' in a && !state.variants.some(v=>v.id===a.variantId))throw new InputError('Exercise variant not found.');
  if('plan' in a && (new Set(a.plan).size!==a.plan.length || a.plan.some(id=>!state.variants.some(v=>v.id===id))))throw new InputError('Choose valid, distinct exercises.');
  if(a.action==='log'){
    const existing=state.sets.find(s=>s.id===a.id);if(existing)return reply(state);
    const v=state.variants.find(v=>v.id===a.variantId)!;
    if((v.unilateral && a.side==='both')||(!v.unilateral && a.side!=='both'))throw new InputError('Select the correct side for this exercise.');
    if(!session!.plan.includes(v.id))throw new InputError('Add this exercise to your workout first.');
    if(a.painSeverity>0 && !a.painLocation.trim())throw new InputError('Choose or enter where you felt pain.');
    const before=recommend(v,session!,state.sets,a.side,a.type,now);
    if(before.status==='pause'||before.status==='complete')throw new InputError(before.reason);
    const set:LoggedSet={...a,createdAt:Math.max(now,...state.sets.filter(s=>s.sessionId===session!.id).map(s=>s.createdAt+1)),suggestedWeight:before.weight,suggestedReps:before.reps};
    const next=recommend(v,session!,[...state.sets,set],a.side,'working',now);
    await database().batch([
      query('INSERT OR IGNORE INTO sets (id,owner,session_id,variant_id,created_at,weight,reps,rir,side,type,pain_location,pain_severity,note,suggested_weight,suggested_reps) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',a.id,owner,a.sessionId,a.variantId,set.createdAt,a.weight,a.reps,a.rir,a.side,a.type,a.painLocation,a.painSeverity,a.note,before.weight,before.reps),
      query('INSERT OR IGNORE INTO progressions (id,owner,session_id,set_id,variant_id,created_at,recommendation) VALUES (?,?,?,?,?,?,?)',a.id+'-next',owner,a.sessionId,a.id,a.variantId,set.createdAt,JSON.stringify(next))
    ]);
  } else if(a.action==='undo'){
    const latest=state.sets.filter(s=>s.sessionId===a.sessionId).sort((a,b)=>b.createdAt-a.createdAt)[0];
    if(!latest||latest.id!==a.setId)throw new InputError('Only the latest set in this workout can be undone.');
    await database().batch([query('DELETE FROM progressions WHERE owner = ? AND set_id = ?',owner,a.setId),query('DELETE FROM sets WHERE owner = ? AND id = ? AND session_id = ?',owner,a.setId,a.sessionId)]);
  } else if(a.action==='finish'){await query('UPDATE sessions SET status = ?, ended_at = ? WHERE id = ? AND owner = ?', 'finished',now,a.sessionId,owner).run();}
  else if(a.action==='start'){
    if(state.sessions.some(s=>s.status==='active'))return reply(state);
    await query('INSERT OR IGNORE INTO sessions (id,owner,name,started_at,ended_at,status,notes,plan,rules) VALUES (?,?,?,?,?,?,?,?,?)',a.id,owner,a.name,now,null,'active','',JSON.stringify(a.plan),'{}').run();
  } else if(a.action==='session'){await query('UPDATE sessions SET name = ?, notes = ?, plan = ? WHERE id = ? AND owner = ?',a.name,a.notes,JSON.stringify(a.plan),a.sessionId,owner).run();}
  else if(a.action==='coach'){
    if(state.messages.some(m=>m.id===a.id))return reply(state);
    const result=interpretCoach(a.message,session!.rules,state.variants,a.variantId,now);
    await database().batch([query('UPDATE sessions SET rules = ? WHERE id = ? AND owner = ?',JSON.stringify(result.rules),a.sessionId,owner),query('INSERT OR IGNORE INTO coach_messages (id,owner,session_id,created_at,message,response) VALUES (?,?,?,?,?,?)',a.id,owner,a.sessionId,now,a.message,result.response)]);
  } else if(a.action==='variant'){
    if(a.minReps>a.maxReps)throw new InputError('Minimum reps cannot exceed maximum reps.');
    if(a.exerciseId && !state.exercises.some(e=>e.id===a.exerciseId))throw new InputError('Base exercise not found.');
    if(!a.exerciseId && !a.baseName)throw new InputError('Name the base exercise.');
    const exerciseId=a.exerciseId||a.id+'-base';
    const writes=[];if(!a.exerciseId)writes.push(query('INSERT OR IGNORE INTO exercises (id,owner,name) VALUES (?,?,?)',exerciseId,owner,a.baseName));
    writes.push(query('INSERT OR IGNORE INTO variants (id,owner,exercise_id,name,equipment,unilateral,load_mode,increment,min_reps,max_reps,default_sets) VALUES (?,?,?,?,?,?,?,?,?,?,?)',a.id,owner,exerciseId,a.name,a.equipment,Number(a.unilateral),a.loadMode,a.increment,a.minReps,a.maxReps,a.defaultSets));
    await database().batch(writes);
  } else if(a.action==='targets'){
    if(a.minReps>a.maxReps)throw new InputError('Minimum reps cannot exceed maximum reps.');
    await query('UPDATE variants SET increment = ?, min_reps = ?, max_reps = ?, default_sets = ? WHERE id = ? AND owner = ?',a.increment,a.minReps,a.maxReps,a.defaultSets,a.variantId,owner).run();
  }
  return reply(await snapshot(owner));
}catch(e){return errorReply(e);}}
