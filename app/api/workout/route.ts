import {z} from 'zod';
import {browserOwner,sameOrigin} from '@/lib/server-auth';
import {ApiError,latestRoutine,saveRoutine} from '@/db/routine-store';
import {saveRoutineSchema,supersetsSchema} from '@/lib/routine';
import {buildProgramSession,programWeek,nextProgramWorkout} from '@/lib/rtf';
import {database,query,initialize,snapshot} from '@/db/store';
import {interpretCoach,recommend} from '@/lib/coach';
import type {LoggedSet} from '@/lib/model';
export const dynamic='force-dynamic';
const id=z.string().min(1).max(180), num=z.number().finite();
export const actionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('log'),id:id,sessionId:id,variantId:id,weight:num.min(0).max(2000),reps:num.int().min(0).max(100),rir:num.int().min(0).max(3).nullable(),side:z.enum(['left','right','both']),type:z.enum(['working','warmup','backoff','drop']),painLocation:z.string().max(100),painSeverity:num.int().min(0).max(10),note:z.string().max(1000)}),
 saveRoutineSchema.extend({action:z.literal('save_routine')}),
 z.object({action:z.literal('supersets'),sessionId:id,supersets:supersetsSchema,expectedSupersets:supersetsSchema}),
 z.object({action:z.literal('undo'),setId:id,sessionId:id}),
 z.object({action:z.literal('finish'),sessionId:id}),
 z.object({action:z.literal('start'),id:id,name:z.string().trim().min(1).max(80),plan:z.array(id).min(1).max(30),workoutId:id.optional(),expectedRoutineRevision:z.number().int().min(0).optional()}),
 z.object({action:z.literal('session'),sessionId:id,name:z.string().trim().min(1).max(80),notes:z.string().max(4000),plan:z.array(id).min(1).max(30)}),
 z.object({action:z.literal('coach'),id:id,sessionId:id,variantId:id,message:z.string().trim().min(1).max(2000)}),
 z.object({action:z.literal('variant'),id:id,exerciseId:z.string().max(180),baseName:z.string().trim().max(80),name:z.string().trim().min(1).max(100),equipment:z.string().trim().min(1).max(100),unilateral:z.boolean(),loadMode:z.enum(['per leg','per dumbbell','total load','machine load']),increment:num.min(.5).max(100),minReps:num.int().min(1).max(50),maxReps:num.int().min(1).max(50),defaultSets:num.int().min(1).max(10)}),
 z.object({action:z.literal('targets'),variantId:id,increment:num.min(.5).max(100),minReps:num.int().min(1).max(50),maxReps:num.int().min(1).max(50),defaultSets:num.int().min(1).max(10)})
]);
class InputError extends Error{}
function reply(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store, private'}});}
function errorReply(e:unknown){if(e instanceof ApiError)return reply({error:e.message},e.status);if(e instanceof InputError)return reply({error:e.message},e.message.startsWith('Sign in')?401:400);if(e instanceof z.ZodError)return reply({error:'Check your entries. Weight, reps, and target ranges must be valid numbers.'},400);console.error('Workout storage request failed',e);return reply({error:'Could not reach your saved workouts. Your entries are still here. Please retry.'},503);}
export async function GET(r:Request){try{const owner=await browserOwner(r);await initialize(owner);return reply(await snapshot(owner));}catch(e){return errorReply(e);}}
export async function POST(r:Request){try{
  const owner=await browserOwner(r);
  sameOrigin(r);
  return await performWorkout(owner,await r.json());
}catch(e){return errorReply(e);}}
export async function performWorkout(owner:string,input:unknown){try{
  const a=actionSchema.parse(input),state=await snapshot(owner),now=Date.now();
  // Reject cross-account collisions in client-supplied globally keyed IDs.
  const table=a.action==='start'?'sessions':a.action==='variant'?'variants':a.action==='coach'?'coach_messages':null;
  if(table&&'id' in a){const row=await query(`SELECT owner FROM ${table} WHERE id = ?`,a.id).first();if(row&&row.owner!==owner)throw new ApiError(409,'Identifier unavailable. Retry with a new identifier.');}
  if(a.action==='variant'&&!a.exerciseId){const row=await query('SELECT owner FROM exercises WHERE id = ?',a.id+'-base').first();if(row&&row.owner!==owner)throw new ApiError(409,'Identifier unavailable. Retry with a new identifier.');}
  const session='sessionId' in a?state.sessions.find(s=>s.id===a.sessionId):undefined;
  if(a.action==='finish'&&session?.status==='finished')return reply(state);
  if(a.action==='log'&&state.sets.some(s=>s.id===a.id)){
    const existing=state.sets.find(s=>s.id===a.id)!;
    if(Object.entries(a).some(([key,value])=>key!=='action'&&existing[key as keyof LoggedSet]!==value))throw new ApiError(409,'Set ID was already used for a different set.');
    return reply(state);
  }
  if('sessionId' in a && (!session||session.status!=='active'))throw new InputError('This workout has finished. Reload or start another workout.');
  if('variantId' in a && !state.variants.some(v=>v.id===a.variantId))throw new InputError('Exercise variant not found.');
  if('plan' in a && (new Set(a.plan).size!==a.plan.length || a.plan.some(id=>!state.variants.some(v=>v.id===id))))throw new InputError('Choose valid, distinct exercises.');
  if(a.action==='log'){
    const existing=state.sets.find(s=>s.id===a.id);if(existing){if(Object.entries(a).some(([key,value])=>key!=='action'&&existing[key as keyof LoggedSet]!==value))throw new ApiError(409,'Set ID was already used for a different set.');return reply(state);}
    const v=state.variants.find(v=>v.id===a.variantId)!;
    if((v.unilateral && a.side==='both')||(!v.unilateral && a.side!=='both'))throw new InputError('Select the correct side for this exercise.');
    if(!session!.plan.includes(v.id))throw new InputError('Add this exercise to your workout first.');
    if(a.painSeverity>0 && !a.painLocation.trim())throw new InputError('Choose or enter where you felt pain.');
    const before=recommend(v,session!,state.sets,a.side,a.type,now);
    if(before.status==='pause'||before.status==='complete')throw new InputError(before.reason);
    if(a.reps===0&&!before.repOut)throw new InputError('Zero reps can only be recorded on the final rep-out set.');
    if(before.program&&a.weight===0&&session!.rules.program?.lifts.find(l=>l.variantId===v.id)?.intensity)throw new InputError('Choose a positive working weight for this lift.');
    const set:LoggedSet={...a,createdAt:Math.max(now,...state.sets.filter(s=>s.sessionId===session!.id).map(s=>s.createdAt+1)),suggestedWeight:before.weight,suggestedReps:before.reps};
    const next=recommend(v,session!,[...state.sets,set],a.side,'working',now);
    const result=await database().batch([
      query("INSERT OR IGNORE INTO sets (id,owner,session_id,variant_id,created_at,weight,reps,rir,side,type,pain_location,pain_severity,note,suggested_weight,suggested_reps) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ? AND owner = ? AND status = 'active' AND rules = ?) AND (SELECT COUNT(*) FROM sets WHERE session_id = ? AND owner = ?) = ?",a.id,owner,a.sessionId,a.variantId,set.createdAt,a.weight,a.reps,a.rir,a.side,a.type,a.painLocation,a.painSeverity,a.note,before.weight,before.reps,a.sessionId,owner,JSON.stringify(session!.rules),a.sessionId,owner,state.sets.filter(s=>s.sessionId===a.sessionId).length),
      query('INSERT OR IGNORE INTO progressions (id,owner,session_id,set_id,variant_id,created_at,recommendation) SELECT ?,?,?,?,?,?,? WHERE changes() > 0',a.id+'-next',owner,a.sessionId,a.id,a.variantId,set.createdAt,JSON.stringify(next))
    ]);
    if(!result[0].meta.changes)throw new ApiError(409,'Workout changed while saving. Reload and retry the same set.');
  } else if(a.action==='undo'){
    const latest=state.sets.filter(s=>s.sessionId===a.sessionId).sort((a,b)=>b.createdAt-a.createdAt)[0];
    if(!latest||latest.id!==a.setId)throw new InputError('Only the latest set in this workout can be undone.');
    await database().batch([query('DELETE FROM progressions WHERE owner = ? AND set_id = ?',owner,a.setId),query('DELETE FROM sets WHERE owner = ? AND id = ? AND session_id = ?',owner,a.setId,a.sessionId)]);
  } else if(a.action==='finish'){
    const rules={...session!.rules};
    if(rules.program)rules.program={...rules.program,advance:state.sets.some(s=>s.sessionId===a.sessionId&&s.type==='working')};
    const result=await query("UPDATE sessions SET status = ?, ended_at = ?, rules = ? WHERE id = ? AND owner = ? AND status = 'active' AND rules = ? AND (SELECT COUNT(*) FROM sets WHERE session_id = ? AND owner = ?) = ?",'finished',now,JSON.stringify(rules),a.sessionId,owner,JSON.stringify(session!.rules),a.sessionId,owner,state.sets.filter(s=>s.sessionId===a.sessionId).length).run();
    if(!result.meta.changes)throw new ApiError(409,'Workout changed while finishing. Reload and finish again.');
  }
  else if(a.action==='start'){
    if(state.sessions.some(s=>s.status==='active'))return reply(state);
    const saved=await latestRoutine(owner);
    if(saved&&a.expectedRoutineRevision!==saved.revision)throw new ApiError(409,'Your routine changed. Reload before starting.');
    const template=saved?.routine.workouts.find(w=>w.id===a.workoutId);
    if(saved&&!template)throw new InputError('Choose a workout from your saved routine.');
    if(saved?.routine.program&&template&&programWeek(saved.routine,template.id,state.sessions)>programWeek(saved.routine,nextProgramWorkout(saved.routine,state.sessions).id,state.sessions))throw new InputError('Finish the remaining workouts in this program week first.');
    if(saved?.routine.program&&template&&programWeek(saved.routine,template.id,state.sessions)>21)throw new InputError('You completed this 21-week cycle. Set up your next cycle before starting.');
    const program=template&&saved?buildProgramSession(saved.routine,template.id,state):undefined;
    const rules={...(template?.timeLimitMinutes?{deadline:now+template.timeLimitMinutes*60000}:{}),...(program?{program}:{}),...(template?.supersets?{supersets:template.supersets}:{})};
    const context=template?[template.notes,saved!.routine.notes,...saved!.routine.constraints].filter(Boolean).join('\n'):'';
    await query('INSERT OR IGNORE INTO sessions (id,owner,name,started_at,ended_at,status,notes,plan,rules,prescriptions,routine_revision) VALUES (?,?,?,?,?,?,?,?,?,?,?)',a.id,owner,template?.name??a.name,now,null,'active',context,JSON.stringify(template?.exercises.map(e=>e.variantId)??a.plan),JSON.stringify(rules),JSON.stringify(template?.exercises??[]),saved?.revision??null).run();
  } else if(a.action==='supersets'){
    if(a.supersets.flat().some(id=>!session!.plan.includes(id)))throw new InputError('Choose exercises in this workout.');
    if(JSON.stringify(session!.rules.supersets??[])===JSON.stringify(a.supersets))return reply(state);
    if(JSON.stringify(session!.rules.supersets??[])!==JSON.stringify(a.expectedSupersets))throw new ApiError(409,'Superset pairings changed. Reload before saving.');
    const rules={...session!.rules,supersets:a.supersets};
    const result=await query("UPDATE sessions SET rules = ? WHERE id = ? AND owner = ? AND status = 'active' AND rules = ?",JSON.stringify(rules),session!.id,owner,JSON.stringify(session!.rules)).run();
    if(!result.meta.changes)throw new ApiError(409,'Workout changed. Reload before saving pairings.');
  } else if(a.action==='save_routine'){
    const {action,...input}=a;await saveRoutine(owner,input,state);
  } else if(a.action==='session'){
    if(session!.rules.program&&JSON.stringify(a.plan)!==JSON.stringify(session!.plan))throw new InputError('Keep the programmed lineup for this workout. Update the saved routine for future sessions.');
    await query('UPDATE sessions SET name = ?, notes = ?, plan = ? WHERE id = ? AND owner = ?',a.name,a.notes,JSON.stringify(a.plan),a.sessionId,owner).run();}
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
