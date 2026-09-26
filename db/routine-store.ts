import {query,database} from './store';
import {defaultRoutine,saveRoutineSchema,type RoutineRevision} from '@/lib/routine';
import type {Snapshot} from '@/lib/model';
export class ApiError extends Error {constructor(public status:number,message:string){super(message);}}
function decode(row:Record<string,unknown>):RoutineRevision{return {revision:Number(row.revision),requestId:String(row.request_id),createdAt:Number(row.created_at),reason:String(row.reason),routine:JSON.parse(String(row.routine))};}
export async function latestRoutine(owner:string):Promise<RoutineRevision|null>{
 const row=await query('SELECT * FROM routine_revisions WHERE owner = ? ORDER BY revision DESC LIMIT 1',owner).first();return row?decode(row):null;
}
export async function routineHistory(owner:string,before=Number.MAX_SAFE_INTEGER){
 const rows=await query('SELECT * FROM routine_revisions WHERE owner = ? AND revision < ? ORDER BY revision DESC LIMIT 10',owner,before).all();
 return rows.results.map(decode);
}
export async function saveRoutine(owner:string,input:unknown,state:Snapshot){
 const a=saveRoutineSchema.parse(input);
 const prior=await query('SELECT * FROM routine_revisions WHERE owner = ? AND request_id = ?',owner,a.requestId).first();
 if(prior){const decoded=decode(prior);if(JSON.stringify(decoded.routine)!==JSON.stringify(a.routine)||decoded.reason!==a.reason||decoded.revision!==a.expectedRevision+1)throw new ApiError(409,'Request ID was already used for another change.');return decoded;}
 if(a.routine.workouts.some(w=>w.exercises.some(e=>!state.variants.some(v=>v.id===e.variantId)||(e.linkedVariants??[]).some(id=>!state.variants.some(v=>v.id===id)))))throw new ApiError(400,'Unknown variant. Read the exercise catalog before changing the routine.');
 if(a.routine.program){
   const keys=a.routine.program.lifts.map(l=>l.workoutId+':'+l.variantId);
   if(new Set(keys).size!==keys.length||a.routine.program.lifts.some(l=>!a.routine.workouts.find(w=>w.id===l.workoutId)?.exercises.some(e=>e.variantId===l.variantId)))throw new ApiError(400,'Program lifts must refer to distinct exercises in the saved workouts.');
 }
 // One conditional INSERT performs the concurrency check and revision write atomically.
 const result=await database().batch([
 query('INSERT OR IGNORE INTO routine_revisions (owner,revision,request_id,created_at,reason,routine) SELECT ?,0,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM routine_revisions WHERE owner = ?)',owner,'_setwise_baseline',Date.now(),'Original exercise lineup before conversational changes',JSON.stringify(defaultRoutine(state)),owner),
 query('INSERT INTO routine_revisions (owner,revision,request_id,created_at,reason,routine) SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT MAX(revision) FROM routine_revisions WHERE owner = ?),0) = ?',owner,a.expectedRevision+1,a.requestId,Date.now(),a.reason,JSON.stringify(a.routine),owner,a.expectedRevision)
 ]);
 if(!result[1].meta.changes)throw new ApiError(409,'Routine changed since you read it. Reload the current routine before applying your change.');
 return decode((await query('SELECT * FROM routine_revisions WHERE owner = ? AND request_id = ?',owner,a.requestId).first())!);
}
export async function currentRoutine(owner:string,state:Snapshot){return await latestRoutine(owner)??{revision:0,requestId:'unsaved-default',createdAt:0,reason:'Derived from the current exercise lineup; no saved routine yet.',routine:defaultRoutine(state)};}
