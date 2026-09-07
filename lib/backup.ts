import {z} from 'zod';
import {identifier,routineSchema,prescriptionSchema} from './routine';
const n=z.number().finite(),time=n.int().min(0),text=z.string();
const rules=z.object({easy:z.boolean().optional(),easySince:time.optional(),targetRir:n.int().min(0).max(3).optional(),maxSets:n.int().min(1).max(10).optional(),minReps:n.int().min(1).max(50).optional(),maxReps:n.int().min(1).max(50).optional(),skipped:z.array(identifier).optional(),deadline:time.optional()});
const recommendation=z.object({weight:n.min(0).nullable(),reps:n.int(),min:n.int(),max:n.int(),targetRir:n.int(),reason:text,status:z.enum(['ready','calibrate','complete','pause']),label:text});
const revision=z.object({revision:n.int().min(0),requestId:identifier,createdAt:time,reason:text,routine:routineSchema});
const backup=z.object({format:z.literal('setwise-backup'),version:z.literal(1),exportedAt:time,revisions:z.array(revision),data:z.object({
 exercises:z.array(z.object({id:identifier,name:text})),
 variants:z.array(z.object({id:identifier,exerciseId:identifier,name:text,equipment:text,unilateral:n.int().min(0).max(1),loadMode:text,increment:n.positive(),minReps:n.int().positive(),maxReps:n.int().positive(),defaultSets:n.int().positive()})),
 sessions:z.array(z.object({id:identifier,name:text,startedAt:time,endedAt:time.nullable(),status:z.enum(['seed','active','finished']),notes:text,plan:z.array(identifier),rules,prescriptions:z.array(prescriptionSchema).default([]),routineRevision:n.int().positive().nullable().optional()})),
 sets:z.array(z.object({id:identifier,sessionId:identifier,variantId:identifier,createdAt:time,weight:n.min(0).max(2000),reps:n.int().min(1).max(100),rir:n.int().min(0).max(3).nullable(),side:z.enum(['left','right','both','unknown']),type:z.enum(['working','warmup','backoff','drop']),painLocation:text,painSeverity:n.int().min(0).max(10),note:text,suggestedWeight:n.nullable(),suggestedReps:n.nullable()})),
 messages:z.array(z.object({id:text.min(1).max(400),sessionId:identifier,createdAt:time,message:text,response:text,requestPayload:text.nullable().optional()})),
 progressions:z.array(z.object({id:text.min(1).max(400),sessionId:identifier,setId:identifier,variantId:identifier,createdAt:time,recommendation})),
 routine:revision.nullable().optional(),
})});
const quoted=(v:unknown):string=>v==null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
export function backupToSQL(input:unknown,owner:string){
 identifier.parse(owner);const b=backup.parse(input),s=b.data;
 const unique=(rows:{id:string}[])=>{const ids=new Set(rows.map(r=>r.id));if(ids.size!==rows.length)throw new Error('Duplicate record IDs');return ids;};
 const ex=unique(s.exercises),variants=unique(s.variants),sessions=unique(s.sessions),sets=unique(s.sets);unique(s.messages);unique(s.progressions);
 if(s.sessions.filter(s=>s.status==='active').length>1)throw new Error('Multiple active sessions');
 if(s.variants.some(v=>!ex.has(v.exerciseId))||s.sessions.some(w=>w.plan.some(id=>!variants.has(id))||w.prescriptions.some(p=>!variants.has(p.variantId)))||s.sets.some(x=>!sessions.has(x.sessionId)||!variants.has(x.variantId))||s.messages.some(x=>!sessions.has(x.sessionId))||s.progressions.some(x=>!sets.has(x.setId)||!sessions.has(x.sessionId)||!variants.has(x.variantId)))throw new Error('Backup contains dangling references');
 if(b.revisions.some(r=>r.routine.workouts.some(w=>w.exercises.some(e=>!variants.has(e.variantId)))))throw new Error('Routine references an unknown variant');
 if(new Set(b.revisions.map(r=>r.revision)).size!==b.revisions.length||new Set(b.revisions.map(r=>r.requestId)).size!==b.revisions.length)throw new Error('Duplicate routine revisions');
 const lines=['-- Setwise validated backup. Import ONLY into an empty database after applying all migrations.','-- No DELETE, UPDATE, or REPLACE statements are used.'];
 function insert(table:string,rows:Record<string,unknown>[]){for(const row of rows)lines.push(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(quoted).join(',')});`);}
 insert('profiles',[{owner,created_at:b.exportedAt}]);
 insert('exercises',s.exercises.map(e=>({...e,owner})));
 insert('variants',s.variants.map(v=>({id:v.id,owner,exercise_id:v.exerciseId,name:v.name,equipment:v.equipment,unilateral:v.unilateral,load_mode:v.loadMode,increment:v.increment,min_reps:v.minReps,max_reps:v.maxReps,default_sets:v.defaultSets})));
 insert('routine_revisions',b.revisions.map(r=>({owner,revision:r.revision,request_id:r.requestId,created_at:r.createdAt,reason:r.reason,routine:JSON.stringify(r.routine)})));
 insert('sessions',s.sessions.map(w=>({id:w.id,owner,name:w.name,started_at:w.startedAt,ended_at:w.endedAt,status:w.status,notes:w.notes,plan:JSON.stringify(w.plan),rules:JSON.stringify(w.rules),prescriptions:JSON.stringify(w.prescriptions),routine_revision:w.routineRevision??null})));
 insert('sets',s.sets.map(x=>({id:x.id,owner,session_id:x.sessionId,variant_id:x.variantId,created_at:x.createdAt,weight:x.weight,reps:x.reps,rir:x.rir,side:x.side,type:x.type,pain_location:x.painLocation,pain_severity:x.painSeverity,note:x.note,suggested_weight:x.suggestedWeight,suggested_reps:x.suggestedReps})));
 insert('coach_messages',s.messages.map(x=>({id:x.id,owner,session_id:x.sessionId,created_at:x.createdAt,message:x.message,response:x.response,request_payload:x.requestPayload??null})));
 insert('progressions',s.progressions.map(x=>({id:x.id,owner,session_id:x.sessionId,set_id:x.setId,variant_id:x.variantId,created_at:x.createdAt,recommendation:JSON.stringify(x.recommendation)})));
 return lines.join('\n')+'\n';
}
